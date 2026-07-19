import React, { useState } from 'react';
import { View, StyleSheet, Alert, Share } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useTheme } from '@/hooks/use-theme';
import { useRecords } from '@/hooks/use-records';
import { Divider, Portal } from 'react-native-paper';
import { Spacing } from '@/constants/theme';
import { PaymentModal } from '@/components/records/payment-modal';
import { formatCurrency } from '@/utils/currency';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingSkeleton } from '@/components/ui/loading-skeleton';
import { PrimaryButton } from '@/components/ui/primary-button';
import { PageContainer } from '@/components/ui/page-container';

import { TransactionSummaryCard } from '@/components/records/transaction-summary-card';
import { TransactionItemRow } from '@/components/records/transaction-item-row';
import { TransactionCostBreakdown } from '@/components/records/transaction-cost-breakdown';
import { TransactionActionBar } from '@/components/records/transaction-action-bar';
import { ThemedText } from '@/components/themed-text';

export default function TransactionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  
  const { sortedBatches, loading } = useRecords(theme);
  const transaction = sortedBatches.find(b => b.id === id);

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');

  const handleAddPayment = async () => {
    if (!transaction || !paymentAmount) return;
    let amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) return;
    
    try {
      const updates: Record<string, any> = {};
      
      // Check if it's a batch (has records array)
      if (transaction.records && Array.isArray(transaction.records)) {
        if (transaction.dbPath && transaction.dbPath.split('/').length >= 3) {
           // New structured data - update batch totalPaid directly
           const currentPaid = transaction.totalPaid || 0;
           updates[`${transaction.dbPath}/totalPaid`] = currentPaid + amount;
        } else {
          // Legacy batch - distribute payment across unpaid items
          const sortedRecords = [...transaction.records].sort((a, b) => {
            return (a.amountPaid || 0) - (b.amountPaid || 0);
          });

          for (const record of sortedRecords) {
            if (amount <= 0) break;
            const currentPaid = record.amountPaid || 0;
            const total = record.total || 0;
            const balance = total - currentPaid;
            
            if (balance > 0 && record.dbPath) {
              const amountToApply = Math.min(balance, amount);
              updates[`${record.dbPath}/amountPaid`] = currentPaid + amountToApply;
              amount -= amountToApply;
            }
          }
          
          if (amount > 0 && sortedRecords.length > 0) {
            const firstRecord = sortedRecords[0];
            if (firstRecord.dbPath) {
              const currentPaid = updates[`${firstRecord.dbPath}/amountPaid`] || firstRecord.amountPaid || 0;
              updates[`${firstRecord.dbPath}/amountPaid`] = currentPaid + amount;
            }
          }
        }
      }
      
      const { db } = await import('@/lib/firebase');
      const { ref, update } = await import('firebase/database');
      await update(ref(db), updates);
      setPaymentModalVisible(false);
      setPaymentAmount('');
    } catch (e: any) {
      alert("Failed to update payment: " + e.message);
    }
  };

  const handleDelete = () => {
    if (!transaction) return;
    
    Alert.alert(
      "Delete Transaction",
      "Are you sure you want to delete this transaction? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { 
          text: "Delete", 
          style: "destructive",
          onPress: async () => {
            try {
              const { db } = await import('@/lib/firebase');
              const { ref, remove } = await import('firebase/database');
              
              if (transaction.dbPath) {
                await remove(ref(db, transaction.dbPath));
              } else {
                // Fallback for legacy items without a clean dbPath at the batch level
                // (Though all should have one now)
                for (const record of transaction.records) {
                  if (record.dbPath) {
                    await remove(ref(db, record.dbPath));
                  }
                }
              }
              router.back();
            } catch (error: any) {
              Alert.alert("Error", "Failed to delete transaction: " + error.message);
            }
          }
        }
      ]
    );
  };

  const handleShare = async () => {
    if (!transaction) return;
    
    try {
      const itemsString = transaction.records.map(r => 
        `- ${r.material} (${r.width}x${r.height} ${r.jobUnit}): ${formatCurrency(r.total || 0)}`
      ).join('\n');

      const message = `Invoice: #${transaction.id.substring(0, 8).toUpperCase()}
Customer: ${transaction.clientName || 'Unknown'}
Grand Total: ${formatCurrency(transaction.totalAmount)}
Outstanding Balance: ${formatCurrency(transaction.totalBalance)}

Items:
${itemsString}`;

      await Share.share({
        message,
        title: `Invoice #${transaction.id.substring(0, 8).toUpperCase()}`,
      });
    } catch (error: any) {
      Alert.alert("Error", "Failed to share: " + error.message);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, padding: 16, backgroundColor: theme.background, gap: 16 }}>
        <LoadingSkeleton width="100%" height={100} borderRadius={16} />
        <LoadingSkeleton width="100%" height={200} borderRadius={16} />
      </View>
    );
  }

  if (!transaction) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, justifyContent: 'center' }}>
        <Stack.Screen options={{ title: 'Not Found', headerBackVisible: true }} />
        <EmptyState 
          iconName="doc.text.magnifyingglass"
          title="Transaction not found"
          message="The transaction you are looking for does not exist or has been removed."
        />
        <View style={{ paddingHorizontal: 32 }}>
          <PrimaryButton onPress={() => router.back()}>Go Back</PrimaryButton>
        </View>
      </View>
    );
  }

  const vat = 0; // Hardcoded for now, would pull from context/settings if applied
  const subtotal = transaction.totalAmount;
  const grandTotal = transaction.totalAmount;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Stack.Screen options={{ title: 'Transaction Details', headerBackVisible: true }} />

      <PageContainer contentContainerStyle={styles.scrollContent}>
        <TransactionSummaryCard 
          grandTotal={grandTotal}
          clientName={transaction.clientName}
          transactionId={transaction.id}
          createdAt={transaction.createdAt}
          status={transaction.status as any}
        />

        <View style={styles.section}>
          <ThemedText type="subtitle" style={{ marginBottom: Spacing.three }}>Purchased Items</ThemedText>
          {transaction.records.map((item) => (
            <TransactionItemRow 
              key={item.id}
              material={item.material}
              width={item.width as any}
              height={item.height as any}
              jobUnit={item.jobUnit}
              quantity={item.quantity}
              total={item.total || 0}
            />
          ))}
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle" style={{ marginBottom: Spacing.three }}>Cost Breakdown</ThemedText>
          <TransactionCostBreakdown 
            subtotal={subtotal}
            vat={vat}
            grandTotal={grandTotal}
            amountPaid={transaction.totalPaid || 0}
            totalBalance={transaction.totalBalance}
          />
        </View>
        
        {/* Extra spacing for Bottom Action Bar */}
        <View style={{ height: 100 }} />
      </PageContainer>

      <TransactionActionBar 
        totalBalance={transaction.totalBalance}
        onPrintInvoice={() => router.push(`/invoice?batchId=${transaction.id}`)}
        onShare={handleShare}
        onDelete={handleDelete}
        onRecordPayment={() => setPaymentModalVisible(true)}
      />

      <Portal>
        <PaymentModal
          paymentModalVisible={paymentModalVisible}
          setPaymentModalVisible={setPaymentModalVisible}
          selectedPaymentRecord={transaction}
          paymentAmount={paymentAmount}
          setPaymentAmount={setPaymentAmount}
          handleAddPayment={handleAddPayment}
          theme={theme}
        />
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: Spacing.six,
  },
  section: {
    padding: Spacing.six,
  },
});
