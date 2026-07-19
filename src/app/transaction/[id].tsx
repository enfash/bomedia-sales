import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Platform, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useTheme } from '@/hooks/use-theme';
import { useRecords } from '@/hooks/use-records';
import { IconButton, Button, Divider, Portal } from 'react-native-paper';
import { SymbolView } from 'expo-symbols';
import { Spacing } from '@/constants/theme';
import { PaymentModal } from '@/components/records/payment-modal';

export default function TransactionDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  
  // For simplicity right now, we use the global records hook to find our transaction
  // A more optimized approach would query Firebase for just this record via dbPath.
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

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Loading transaction...</ThemedText>
      </ThemedView>
    );
  }

  if (!transaction) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Transaction not found.</ThemedText>
        <Button mode="contained" onPress={() => router.back()} style={{ marginTop: 20 }}>Go Back</Button>
      </ThemedView>
    );
  }

  const vat = 0; // Hardcoded for now, would pull from context/settings if applied
  const subtotal = transaction.totalAmount;
  const grandTotal = transaction.totalAmount;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Top App Bar */}
      <View style={[styles.header, { borderBottomColor: theme.outline }]}>
        <IconButton
          icon="arrow-left"
          iconColor={theme.onSurface}
          size={24}
          onPress={() => router.back()}
        />
        <ThemedText type="subtitle" style={{ flex: 1 }}>Transaction Details</ThemedText>
        <IconButton
          icon="dots-vertical"
          iconColor={theme.onSurface}
          size={24}
          onPress={() => {}}
        />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Customer Information */}
        <View style={styles.section}>
          <ThemedText type="small" themeColor="onSurfaceVariant">Customer Information</ThemedText>
          <ThemedText type="title" style={{ marginTop: 4 }}>{transaction.clientName || 'Unknown Client'}</ThemedText>
          <View style={[styles.metaRow, { marginTop: 16 }]}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <SymbolView name={{ ios: 'doc.text', android: 'description', web: 'description' }} size={16} tintColor={theme.onSurfaceVariant} style={{ marginRight: 8 }} />
                <ThemedText type="small" themeColor="onSurfaceVariant">Invoice:</ThemedText>
              </View>
              <ThemedText style={{ fontWeight: '600' }}>#{transaction.id.substring(0, 8).toUpperCase()}</ThemedText>
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <SymbolView name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }} size={16} tintColor={theme.onSurfaceVariant} style={{ marginRight: 8 }} />
                <ThemedText type="small" themeColor="onSurfaceVariant">Date:</ThemedText>
              </View>
              <ThemedText style={{ fontWeight: '600' }}>{new Date(transaction.createdAt).toLocaleDateString()}</ThemedText>
            </View>
          </View>
          
          <View style={[styles.statusChip, { backgroundColor: transaction.statusColor + '20', marginTop: 16 }]}>
            <SymbolView 
              name={transaction.status === 'Paid' ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' } : { ios: 'exclamationmark.circle.fill', android: 'info', web: 'info' }} 
              size={16} 
              tintColor={transaction.statusColor} 
              style={{ marginRight: 6 }} 
            />
            <Text style={{ color: transaction.statusColor, fontWeight: '700', fontSize: 14 }}>
              {transaction.status.toUpperCase()}
            </Text>
          </View>
        </View>

        <Divider style={{ backgroundColor: theme.outline }} />

        {/* Purchased Items */}
        <View style={styles.section}>
          <ThemedText type="subtitle" style={{ marginBottom: 12 }}>Purchased Items</ThemedText>
          {transaction.records.map((item, idx) => (
            <View key={item.id} style={styles.itemRow}>
              <View style={{ flex: 1, paddingRight: 16 }}>
                <ThemedText style={{ fontWeight: '600' }}>{item.material}</ThemedText>
                <ThemedText type="small" themeColor="onSurfaceVariant" style={{ marginTop: 2 }}>
                  {item.width}x{item.height} {item.jobUnit} • Qty: {item.quantity}
                </ThemedText>
              </View>
              <ThemedText style={{ fontWeight: '600' }}>₦{(item.total || 0).toLocaleString()}</ThemedText>
            </View>
          ))}
        </View>

        <Divider style={{ backgroundColor: theme.outline }} />

        {/* Cost Breakdown */}
        <View style={styles.section}>
          <ThemedText type="subtitle" style={{ marginBottom: 12 }}>Cost Breakdown</ThemedText>
          
          <View style={styles.breakdownRow}>
            <ThemedText themeColor="onSurfaceVariant">Subtotal:</ThemedText>
            <ThemedText>₦{subtotal.toLocaleString()}</ThemedText>
          </View>
          <View style={styles.breakdownRow}>
            <ThemedText themeColor="onSurfaceVariant">VAT (0%):</ThemedText>
            <ThemedText>₦{vat.toLocaleString()}</ThemedText>
          </View>
          <View style={[styles.breakdownRow, { marginTop: 8, marginBottom: 16 }]}>
            <ThemedText style={{ fontWeight: '700', fontSize: 16 }}>Grand Total:</ThemedText>
            <ThemedText style={{ fontWeight: '700', fontSize: 16 }}>₦{grandTotal.toLocaleString()}</ThemedText>
          </View>

          <View style={styles.breakdownRow}>
            <ThemedText themeColor="onSurfaceVariant">Amount Paid:</ThemedText>
            <ThemedText>₦{(transaction.totalPaid || 0).toLocaleString()}</ThemedText>
          </View>
          <View style={[styles.breakdownRow, { marginTop: 4 }]}>
            <ThemedText style={{ fontWeight: '700' }}>Outstanding Balance:</ThemedText>
            <ThemedText style={{ fontWeight: '700', color: transaction.totalBalance > 0 ? theme.error : '#2E7D32' }}>
              ₦{transaction.totalBalance.toLocaleString()}
            </ThemedText>
          </View>
        </View>
        
        {/* Extra spacing for Bottom Action Bar */}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Action Bar */}
      <View style={[styles.bottomActionBar, { backgroundColor: theme.surface, borderTopColor: theme.outline }]}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <IconButton icon="printer" mode="outlined" iconColor={theme.onSurfaceVariant} size={24} onPress={() => router.push(`/invoice?batchId=${transaction.id}`)} />
          <IconButton icon="share-variant" mode="outlined" iconColor={theme.onSurfaceVariant} size={24} onPress={() => {}} />
          <IconButton icon="pencil" mode="outlined" iconColor={theme.onSurfaceVariant} size={24} onPress={() => {}} />
          <IconButton icon="delete" mode="outlined" iconColor={theme.error} size={24} onPress={() => {}} />
        </View>
        
        {transaction.totalBalance > 0 && (
          <Button 
            mode="contained" 
            icon="cash-register"
            style={{ borderRadius: 12, marginLeft: 'auto' }} 
            contentStyle={{ paddingHorizontal: 16, height: 48 }}
            buttonColor={theme.primary}
            onPress={() => setPaymentModalVisible(true)}
          >
            Record Payment
          </Button>
        )}
      </View>

      {/* Payment Modal */}
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderBottomWidth: 1,
  },
  scrollContent: {
    paddingBottom: Spacing.six,
  },
  section: {
    padding: Spacing.six,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  bottomActionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Platform.OS === 'ios' ? 32 : Spacing.four,
    borderTopWidth: 1,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
  }
});
