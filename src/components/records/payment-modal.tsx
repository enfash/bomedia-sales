import React from 'react';
import { View, StyleSheet, Modal, Pressable, TextInput, Text } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatCurrency } from '@/utils/currency';

interface PaymentModalProps {
  paymentModalVisible: boolean;
  setPaymentModalVisible: (v: boolean) => void;
  selectedPaymentRecord: any | null; // can be SalesRecord or SalesBatch
  paymentAmount: string;
  setPaymentAmount: (amount: string) => void;
  handleAddPayment: () => void;
  theme: any;
}

export function PaymentModal({
  paymentModalVisible,
  setPaymentModalVisible,
  selectedPaymentRecord,
  paymentAmount,
  setPaymentAmount,
  handleAddPayment,
  theme
}: PaymentModalProps) {
  const isBatch = selectedPaymentRecord?.records && Array.isArray(selectedPaymentRecord.records);
  const clientName = selectedPaymentRecord?.clientName || 'Unknown';
  
  let remainingBalance = 0;
  if (selectedPaymentRecord) {
    if (isBatch) {
      remainingBalance = selectedPaymentRecord.totalBalance || 0;
    } else {
      remainingBalance = (selectedPaymentRecord.total || 0) - (selectedPaymentRecord.amountPaid || 0);
    }
  }

  return (
    <Modal
      visible={paymentModalVisible}
      transparent={true}
      animationType="fade"
      onRequestClose={() => setPaymentModalVisible(false)}
    >
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
          <View style={styles.modalHeader}>
            <ThemedText type="subtitle">Add Payment {isBatch ? '(Batch)' : ''}</ThemedText>
            <Pressable onPress={() => setPaymentModalVisible(false)}>
              <SymbolView name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }} size={24} tintColor={theme.onSurfaceVariant} />
            </Pressable>
          </View>
          
          {selectedPaymentRecord && (
            <View style={styles.modalBody}>
              <ThemedText type="small" themeColor="onSurfaceVariant">
                Recording payment for <ThemedText type="smallBold">{clientName}</ThemedText>
              </ThemedText>
              <ThemedText type="small" themeColor="onSurfaceVariant">
                Remaining Balance: <ThemedText type="smallBold">{formatCurrency(remainingBalance)}</ThemedText>
              </ThemedText>

              <View style={[styles.inputWrapper, { backgroundColor: theme.background, borderColor: theme.surfaceVariant, marginTop: Spacing.four }]}>
                <Text style={[styles.inputPrefix, { color: theme.onSurfaceVariant }]}>₦</Text>
                <TextInput
                  style={[styles.input, { color: theme.onSurface }]}
                  keyboardType="numeric"
                  placeholder="0.00"
                  placeholderTextColor={theme.onSurfaceVariant}
                  value={paymentAmount}
                  onChangeText={setPaymentAmount}
                  autoFocus
                />
              </View>

              <Pressable 
                style={({ pressed }) => [styles.submitButton, { backgroundColor: theme.primary }, pressed && { opacity: 0.8 }]} 
                onPress={handleAddPayment}
              >
                <Text style={[styles.submitButtonText, { color: '#ffffff' }]}>Confirm Payment</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    boxShadow: '0px 10px 30px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  modalBody: {
    gap: Spacing.one,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 52,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  inputPrefix: {
    fontSize: 18,
    fontWeight: '600',
    marginRight: Spacing.two,
  },
  input: {
    flex: 1,
    height: '100%',
    fontSize: 18,
    fontWeight: '500',
  },
  submitButton: {
    height: 52,
    borderRadius: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Spacing.four,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
  }
});
