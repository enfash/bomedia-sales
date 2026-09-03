import { PageContainer } from '@/components/ui/page-container';
import { PrimaryButton } from '@/components/ui/primary-button';
import { createSale } from '@/services/sales-repository-pg';
import { generateReceiptId } from '@/services/sales-repository';
import { resolveClientId } from '@/services/client-repository-pg';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { DEFAULT_SETTINGS, useSettings } from '@/context/settings-context';
import { useTheme } from '@/hooks/use-theme';
import { UNCONFIRMED_MESSAGE, useConfirmWindow } from '@/hooks/use-confirm-window';
import { describeWriteError } from '@/utils/errors';
import { logActivity } from '@/services/activity';
import { formatCurrency } from '@/utils/currency';
import { computeBatchTotals } from '@/utils/money';

import { BatchReviewCard } from '@/components/sales/batch-review-card';
import { ClientInfoCard, ClientInfoRef } from '@/components/sales/client-info-card';
import { JobDetailCard } from '@/components/sales/job-detail-card';

export default function NewSalesScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const { settings, isLoading: settingsLoading, loadError: settingsLoadError, refreshSettings } = useSettings();
  const { actor } = useAuth();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

  const [batchItems, setBatchItems] = useState<any[]>([]);
  
  // Payment States
  const [deliveryCost, setDeliveryCost] = useState('');
  const [advancePayment, setAdvancePayment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'POS' | 'Transfer'>('Transfer');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const confirmWindow = useConfirmWindow();

  const scrollViewRef = useRef<ScrollView | null>(null);
  const clientInfoRef = useRef<ClientInfoRef>(null);

  const handleAddToBatch = useCallback((item: any) => {
    setBatchItems((prev) => [...prev, item]);
  }, []);

  const handleRemoveItem = useCallback((id: string) => {
    setBatchItems((prev) => prev.filter(item => item.id !== id));
  }, []);

  // All batch arithmetic lives in utils/money.ts. The MOV top-up and delivery
  // come back as labelled adjustment rows rather than silently inflating the
  // total — see the decision recorded in computeBatchTotals.
  const { subtotal: batchSubtotal, adjustments, totalAmount: finalBatchTotal } = computeBatchTotals({
    lineTotals: batchItems.map((item) => item.total),
    mov: settings?.mov || 1000,
    delivery: parseFloat(deliveryCost) || 0,
  });

  const submitBatch = async () => {
    // Double-submit guard: createSale generates a fresh receiptId on every
    // call, so a second tap while the first is in flight writes a second real
    // sale under a different id. Nothing downstream can tell them apart.
    if (isSubmitting) return;

    const clientData = clientInfoRef.current?.getData();
    if (!clientData || !clientInfoRef.current?.validate() || batchItems.length === 0) {
      Alert.alert('Missing details', 'Please enter a client name and add at least one item.');
      return;
    }

    setIsSubmitting(true);

    let clientId: string;
    try {
      clientId = await resolveClientId(clientData.clientName, clientData.contact);
    } catch (err) {
      setIsSubmitting(false);
      const message = describeWriteError(err, 'resolve this client');
      Alert.alert(message.title, message.body);
      return;
    }

    // Generated up front, not read back from createSale's result — an
    // unconfirmed write (timeout/disconnected) may still land later with no
    // further signal, and the "write it on paper" alert below has to name
    // the receipt regardless of whether the promise itself ever settles.
    const receiptId = generateReceiptId();
    const advanceAmount = parseFloat(advancePayment) || 0;

    // Bounded, like every money write. Offline this never settles, and a second
    // tap creates a SECOND real sale under a different receipt id — nothing
    // downstream can tell them apart.
    const result = await confirmWindow.run(
      createSale(
        {
          clientId,
          clientName: clientData.clientName,
          lines: batchItems.map((item) => ({
            jobName: item.jobName,
            material: item.material,
            width: item.width,
            height: item.height,
            jobUnit: item.jobUnit,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            total: item.total,
            eyelets: item.eyelets,
            lamination: item.lamination,
            turnaroundTime: item.turnaroundTime,
          })),
          adjustments,
          ...(advanceAmount > 0 ? { openingPayment: { amount: advanceAmount, method: paymentMethod } } : {}),
          // Attributes the advance to whoever is at the counter.
          actor,
        },
        receiptId,
      ),
    );
    setIsSubmitting(false);

    if (result.outcome === 'failed') {
      // An answer, and a refusal. Keep the form as it is so it can be retried
      // or corrected without re-entering everything.
      console.error('Error submitting batch:', result.error);
      const message = describeWriteError(result.error, 'record this sale');
      Alert.alert(message.title, message.body);
      return;
    }

    logActivity({
      type: 'sale_created',
      actor,
      message: `${actor.name} created a ${formatCurrency(finalBatchTotal)} sale for ${clientData.clientName}`,
      meta: { receiptId, amount: finalBatchTotal, clientName: clientData.clientName },
    });

    // The form is cleared for BOTH confirmed and unconfirmed. An unconfirmed
    // sale may well have landed, and leaving the form populated invites it to
    // be submitted a second time under a new receipt id.
    setBatchItems([]);
    clientInfoRef.current.reset();
    setDeliveryCost('');
    setAdvancePayment('');
    setPaymentMethod('Transfer');

    if (confirmWindow.isUnconfirmed(result.outcome)) {
      Alert.alert('Not confirmed', `Receipt ${receiptId}. ${UNCONFIRMED_MESSAGE}`);
    } else {
      Alert.alert('Success', `Batch submitted successfully!\nReceipt: ${receiptId}`);
    }
  };

  // An operator must never price a real job against fallback material
  // prices. Blocks on either signal independently: still loading, or loaded
  // but stuck on DEFAULT_SETTINGS (the mint-firebase-token bridge timed out
  // — see whenFirebaseAuthed in @/lib/firebase). No form, no 12px spinner
  // easy to miss — a full blocking message instead.
  if (settingsLoading || settings === DEFAULT_SETTINGS) {
    return (
      <ThemedView style={[styles.blockedContainer, { backgroundColor: theme.background }]}>
        {settingsLoadError ? (
          <>
            <ThemedText type="subtitle" style={styles.blockedTitle}>Settings did not load</ThemedText>
            <ThemedText themeColor="onSurfaceVariant" style={styles.blockedBody}>
              Material prices could not be confirmed, so a new sale cannot be
              priced safely right now. Check your connection and try again —
              if this keeps happening, tell the owner.
            </ThemedText>
            <PrimaryButton onPress={refreshSettings}>Try again</PrimaryButton>
          </>
        ) : (
          <>
            <ActivityIndicator size="large" color={theme.primary} />
            <ThemedText themeColor="onSurfaceVariant" style={[styles.blockedBody, { marginTop: Spacing.three }]}>
              Loading settings…
            </ThemedText>
          </>
        )}
      </ThemedView>
    );
  }

  return (
    <>
      <KeyboardAvoidingView 
        style={{ flex: 1, backgroundColor: theme.background }} 
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <PageContainer ref={scrollViewRef} footerHeight={150}>
          <ThemedView style={styles.container}>
            {/* Header */}
            <ThemedView style={styles.header}>
              <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'center' }]}>
                <View>
                  <ThemedText type="subtitle" style={styles.title}>New Sales Record</ThemedText>
                  <ThemedText themeColor="onSurfaceVariant" style={styles.subtitle}>
                    Enter details for a new sale.
                  </ThemedText>
                </View>
              </View>
            </ThemedView>

            <ClientInfoCard ref={clientInfoRef} />
            
            <JobDetailCard onAddToBatch={handleAddToBatch} />

            <BatchReviewCard 
              batchItems={batchItems}
              settings={settings}
              subtotal={batchSubtotal}
              adjustments={adjustments}
              totalAmount={finalBatchTotal}
              onRemoveItem={handleRemoveItem}
              deliveryCost={deliveryCost}
              setDeliveryCost={setDeliveryCost}
              advancePayment={advancePayment}
              setAdvancePayment={setAdvancePayment}
              paymentMethod={paymentMethod}
              setPaymentMethod={setPaymentMethod}
            />
          </ThemedView>
        </PageContainer>

        {/* Sticky Bottom Footer for Checkout */}
        {batchItems.length > 0 && (
          <View style={[
            styles.stickyFooter, 
            { 
              backgroundColor: theme.surface,
              borderTopColor: theme.surfaceVariant,
              paddingBottom: Platform.OS === 'ios' ? insets.bottom : Spacing.four,
            }
          ]}>
            <View style={[styles.row, { justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' }]}>
              <View>
                <ThemedText type="small" themeColor="onSurfaceVariant">Final Total</ThemedText>
                <ThemedText type="subtitle" style={{ color: theme.primary, fontWeight: '700' }}>
                  {formatCurrency(finalBatchTotal)}
                </ThemedText>
              </View>
              
              <PrimaryButton
                onPress={submitBatch}
                disabled={isSubmitting}
                loading={isSubmitting}
                style={{ paddingHorizontal: 16 }}
              >
                {confirmWindow.secondsLeft !== null
                  ? `Confirming… ${confirmWindow.secondsLeft}s`
                  : isSubmitting
                    ? 'Recording…'
                    : 'Record Sale'}
              </PrimaryButton>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  blockedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  blockedTitle: {
    textAlign: 'center',
  },
  blockedBody: {
    textAlign: 'center',
    maxWidth: 360,
  },
  container: {
    flex: 1,
    gap: Spacing.four,
  },
  header: {
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  title: {
    marginBottom: Spacing.one,
  },
  subtitle: {
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    elevation: 8,
    boxShadow: '0px -4px 12px rgba(0,0,0,0.1)',
  },
});
