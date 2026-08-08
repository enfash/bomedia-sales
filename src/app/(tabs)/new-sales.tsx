import { PageContainer } from '@/components/ui/page-container';
import { PrimaryButton } from '@/components/ui/primary-button';
import { createBatch, generateReceiptId } from '@/services/sales-repository';
import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useSettings } from '@/context/settings-context';
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
  const { settings } = useSettings();
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
    // Double-submit guard: createBatch generates a fresh receiptId on every
    // call, so a second tap while the first is in flight writes a second real
    // sale under a different id. Nothing downstream can tell them apart.
    if (isSubmitting) return;

    const clientData = clientInfoRef.current?.getData();
    if (!clientData || !clientInfoRef.current?.validate() || batchItems.length === 0) {
      Alert.alert('Missing details', 'Please enter a client name and add at least one item.');
      return;
    }

    setIsSubmitting(true);
    const receiptId = generateReceiptId();

    // Bounded, like every money write. Offline this never settles, and a second
    // tap creates a SECOND real sale under a different receipt id — nothing
    // downstream can tell them apart.
    const result = await confirmWindow.run(
      createBatch({
        receiptId,
        clientName: clientData.clientName,
        contact: clientData.contact,
        subtotal: batchSubtotal,
        adjustments,
        totalAmount: finalBatchTotal,
        deliveryCost: parseFloat(deliveryCost) || 0,
        totalPaid: parseFloat(advancePayment) || 0,
        paymentMethod,
        items: batchItems,
        // Attributes the advance to whoever is at the counter.
        actor,
      }),
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
