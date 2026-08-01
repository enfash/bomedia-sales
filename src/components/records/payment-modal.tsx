import type { PaymentMethod } from '@/components/records/types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatCurrency } from '@/utils/currency';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const METHODS: PaymentMethod[] = ['Cash', 'POS', 'Transfer'];

interface PaymentModalProps {
  paymentModalVisible: boolean;
  setPaymentModalVisible: (v: boolean) => void;
  selectedPaymentRecord: any | null; // SalesRecord or SalesBatch
  paymentAmount: string;
  setPaymentAmount: (amount: string) => void;
  /** How the money was taken. Captured per payment, not just at sale creation. */
  paymentMethod: PaymentMethod;
  setPaymentMethod: (m: PaymentMethod) => void;
  /** Optional free text — "cash in envelope", "part payment", a cheque number. */
  paymentNote: string;
  setPaymentNote: (n: string) => void;
  handleAddPayment: () => void;
  /** Blocks the double-tap that would otherwise queue two ledger entries. */
  isSubmitting?: boolean;
  theme: any;
}

export function PaymentModal({
  paymentModalVisible,
  setPaymentModalVisible,
  selectedPaymentRecord,
  paymentAmount,
  setPaymentAmount,
  paymentMethod,
  setPaymentMethod,
  paymentNote,
  setPaymentNote,
  handleAddPayment,
  isSubmitting = false,
  theme,
}: PaymentModalProps) {
  const isBatch = selectedPaymentRecord?.records && Array.isArray(selectedPaymentRecord.records);
  const clientName = selectedPaymentRecord?.clientName || 'Unknown';

  let remainingBalance = 0;
  if (selectedPaymentRecord) {
    remainingBalance = isBatch
      ? selectedPaymentRecord.totalBalance || 0
      : (selectedPaymentRecord.total || 0) - (selectedPaymentRecord.amountPaid || 0);
  }

  const amount = parseFloat(paymentAmount) || 0;
  // Overpayment is allowed — deposits and goodwill are real — but it is
  // confirmed rather than silent, because it is usually a typo.
  const isOverpayment = amount > remainingBalance && remainingBalance > 0;
  const canSubmit = amount > 0 && !isSubmitting;

  return (
    <Modal
      visible={paymentModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => setPaymentModalVisible(false)}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <ThemedText type="defaultSemiBold">Record a payment</ThemedText>
              <ThemedText type="small" themeColor="onSurfaceVariant" numberOfLines={1}>
                {clientName} · {formatCurrency(remainingBalance)} outstanding
              </ThemedText>
            </View>
            <Pressable onPress={() => setPaymentModalVisible(false)} hitSlop={8}>
              <SymbolView
                name={{ ios: 'xmark', android: 'close', web: 'close' }}
                size={18}
                tintColor={theme.onSurfaceVariant}
              />
            </Pressable>
          </View>

          {/* Amount */}
          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>
            Amount (₦)
          </ThemedText>
          <TextInput
            value={paymentAmount}
            onChangeText={setPaymentAmount}
            keyboardType="numeric"
            placeholder={String(remainingBalance || '')}
            placeholderTextColor={theme.onSurfaceVariant}
            style={[styles.input, { color: theme.onSurface, borderColor: theme.outlineVariant }]}
            autoFocus
          />
          {remainingBalance > 0 && (
            <Pressable onPress={() => setPaymentAmount(String(remainingBalance))} hitSlop={8}>
              <ThemedText type="small" style={{ color: theme.primary }}>
                Pay the full {formatCurrency(remainingBalance)}
              </ThemedText>
            </Pressable>
          )}

          {/* Method — the field whose absence made reconciliation impossible */}
          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>
            How was it paid?
          </ThemedText>
          <View style={styles.methods}>
            {METHODS.map((m) => {
              const active = paymentMethod === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setPaymentMethod(m)}
                  style={[
                    styles.method,
                    {
                      borderColor: active ? theme.primary : theme.outlineVariant,
                      backgroundColor: active ? theme.primary : 'transparent',
                    },
                  ]}
                >
                  <Text style={{ color: active ? theme.onPrimary : theme.onSurface, fontWeight: '600' }}>
                    {m}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Note */}
          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>
            Note (optional)
          </ThemedText>
          <TextInput
            value={paymentNote}
            onChangeText={setPaymentNote}
            placeholder="e.g. part payment, paid to Ada"
            placeholderTextColor={theme.onSurfaceVariant}
            style={[styles.input, { color: theme.onSurface, borderColor: theme.outlineVariant }]}
          />

          {isOverpayment && (
            <ThemedText type="small" style={[styles.warn, { color: theme.error }]}>
              That is {formatCurrency(amount - remainingBalance)} more than the outstanding
              balance. It will be recorded and the sale will show as Overpaid.
            </ThemedText>
          )}

          {/* An honest description of what happens offline. The write is applied
              locally first, so it looks saved before the server has confirmed. */}
          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.note}>
            Payments are never edited or deleted — a mistake is corrected by a
            reversal, which an admin can add. If you are offline this saves on
            this device and syncs when you reconnect; don&apos;t force-quit the app
            before it does.
          </ThemedText>

          <Pressable
            onPress={handleAddPayment}
            disabled={!canSubmit}
            style={[
              styles.submit,
              { backgroundColor: canSubmit ? theme.primary : theme.surfaceVariant },
            ]}
          >
            <Text
              style={{
                color: canSubmit ? theme.onPrimary : theme.onSurfaceVariant,
                fontWeight: '700',
              }}
            >
              {isSubmitting ? 'Recording…' : `Record ${formatCurrency(amount)}`}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    padding: Spacing.four,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: Spacing.two,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.two },
  label: { marginTop: Spacing.two },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  methods: { flexDirection: 'row', gap: Spacing.two },
  method: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  warn: { marginTop: Spacing.one },
  note: { marginTop: Spacing.two, lineHeight: 18 },
  submit: {
    marginTop: Spacing.three,
    borderRadius: 14,
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
});
