import { PageContainer } from '@/components/ui/page-container';
import { PrimaryButton } from '@/components/ui/primary-button';
import { createBatch, generateReceiptId } from '@/services/sales-repository';
import { useCallback, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useSettings } from '@/context/settings-context';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/currency';

import { BatchReviewCard } from '@/components/sales/batch-review-card';
import { ClientInfoCard, ClientInfoRef } from '@/components/sales/client-info-card';
import { JobDetailCard } from '@/components/sales/job-detail-card';

export default function NewSalesScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const { settings } = useSettings();
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

  const scrollViewRef = useRef<ScrollView | null>(null);
  const clientInfoRef = useRef<ClientInfoRef>(null);

  const handleAddToBatch = useCallback((item: any) => {
    setBatchItems((prev) => [...prev, item]);
  }, []);

  const handleRemoveItem = useCallback((id: string) => {
    setBatchItems((prev) => prev.filter(item => item.id !== id));
  }, []);

  const batchSubtotal = batchItems.reduce((sum, item) => sum + item.total, 0);
  const finalBatchTotal = batchItems.length > 0 
    ? Math.max(batchSubtotal, settings?.mov || 1000) + (parseFloat(deliveryCost) || 0) 
    : 0;

  const submitBatch = async () => {
    const clientData = clientInfoRef.current?.getData();
    if (!clientData || !clientInfoRef.current?.validate() || batchItems.length === 0) {
      alert("Please enter a client name and add at least one item.");
      return;
    }
    
    try {
      const receiptId = generateReceiptId();

      await createBatch({
        receiptId,
        clientName: clientData.clientName,
        contact: clientData.contact,
        totalAmount: finalBatchTotal,
        deliveryCost: parseFloat(deliveryCost) || 0,
        totalPaid: parseFloat(advancePayment) || 0,
        paymentMethod,
        items: batchItems,
      });

      Alert.alert('Success', `Batch submitted successfully!\nReceipt: ${receiptId}`);
      setBatchItems([]);
      clientInfoRef.current.reset();
      setDeliveryCost('');
      setAdvancePayment('');
      setPaymentMethod('Transfer');
      
    } catch (error) {
      console.error('Error submitting batch:', error);
      Alert.alert('Error', 'Failed to submit batch. Check your connection or Firebase config.');
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
                style={{ paddingHorizontal: 16 }}
              >
                Record Sale
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
