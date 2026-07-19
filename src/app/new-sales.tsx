import { dbService } from '@/services/db';
import React, { useState, useRef, useCallback } from 'react';
import { Platform, ScrollView, StyleSheet, View, KeyboardAvoidingView, Alert } from 'react-native';
import { Button } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { PageContainer } from '@/components/ui/page-container';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useSettings } from '@/context/settings-context';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/currency';

import { ClientInfoCard, ClientInfoRef } from '@/components/sales/client-info-card';
import { JobDetailCard } from '@/components/sales/job-detail-card';
import { BatchReviewCard } from '@/components/sales/batch-review-card';

export default function NewSalesScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const { settings } = useSettings();
  const insets = {
    ...safeAreaInsets,
    bottom: safeAreaInsets.bottom + BottomTabInset + Spacing.three,
  };
  const theme = useTheme();

  const scrollViewRef = useRef<ScrollView>(null);
  
  useFocusEffect(
    useCallback(() => {
      // Scroll to top when screen comes into focus
      if (scrollViewRef.current) {
        scrollViewRef.current.scrollTo({ y: 0, animated: false });
      }
    }, [])
  );

  const [batchItems, setBatchItems] = useState<any[]>([]);
  
  // Payment States
  const [deliveryCost, setDeliveryCost] = useState('');
  const [advancePayment, setAdvancePayment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'POS' | 'Transfer'>('Transfer');

  const clientInfoRef = useRef<ClientInfoRef>(null);

  const handleAddToBatch = useCallback((item: any) => {
    setBatchItems((prev) => [...prev, item]);
  }, []);

  const handleRemoveItem = useCallback((id: string) => {
    setBatchItems((prev) => prev.filter(item => item.id !== id));
  }, []);

  const generateReceiptId = () => {
    const today = new Date();
    const yy = String(today.getFullYear()).slice(-2);
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const randomChars = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `INV-${yy}${mm}${dd}-${randomChars}`;
  };

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
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      
      const receiptId = generateReceiptId();
      const delCost = parseFloat(deliveryCost) || 0;
      const totalPaid = parseFloat(advancePayment) || 0;
      
      const batchRecord = {
        receiptId,
        clientName: clientData.clientName,
        contact: clientData.contact,
        createdAt: new Date().toISOString(),
        totalAmount: finalBatchTotal,
        deliveryCost: delCost,
        totalPaid: totalPaid,
        paymentMethod: paymentMethod,
        status: totalPaid >= finalBatchTotal ? 'Paid' : (totalPaid > 0 ? 'Partially Paid' : 'Pending'),
        items: {} as any
      };

      batchItems.forEach((item, index) => {
        const itemId = `item_${index}`;
        batchRecord.items[itemId] = {
          ...item
        };
      });

      // Updated path structure: sales/YYYY/MM/DD/receiptId
      await dbService.setRecord(`sales/${yyyy}/${mm}/${dd}/${receiptId}`, batchRecord);
      
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

  const contentPlatformStyle = Platform.select({
    android: {
      paddingTop: insets.top,
      paddingLeft: insets.left,
      paddingRight: insets.right,
    },
    web: {
      paddingTop: Spacing.six,
    },
  });

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
              
              <Button
                mode="contained"
                buttonColor="#0A802F"
                onPress={submitBatch}
                contentStyle={{ height: 48, paddingHorizontal: 16 }}
              >
                Record Sale
              </Button>
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
});
