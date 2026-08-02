import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatCurrency } from '@/utils/currency';
import { STATUS_META } from '@/utils/payment-status';
import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

interface VoidModalProps {
  visible: boolean;
  onClose: () => void;
  /** The id the operator must type back, exactly. */
  receiptId: string;
  /** What kind of record — used in the copy only. */
  kind?: 'sale' | 'quote';
  /**
   * Money already collected against this record. Voiding does NOT refund it,
   * and saying so is the whole point of surfacing the figure here.
   */
  collected?: number;
  onConfirm: (reason: string) => void;
  isSubmitting?: boolean;
  theme: any;
}

export function VoidModal({
  visible,
  onClose,
  receiptId,
  kind = 'sale',
  collected = 0,
  onConfirm,
  isSubmitting = false,
  theme,
}: VoidModalProps) {
  const [typedId, setTypedId] = useState('');
  const [reason, setReason] = useState('');

  const idMatches = typedId.trim() === receiptId;
  const hasReason = reason.trim().length > 0;
  const canConfirm = idMatches && hasReason && !isSubmitting;

  const close = () => {
    setTypedId('');
    setReason('');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: theme.surface }]}>
          <ThemedText type="defaultSemiBold">Void this {kind}?</ThemedText>

          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.body}>
            The {kind} stays in the records, marked voided, and drops out of every
            total, the dashboard and the board. Nothing is erased — a voided
            {' '}{kind} can still be found under the Voided filter.
          </ThemedText>

          {collected > 0 && (
            <View style={[styles.warn, { backgroundColor: STATUS_META.Partial.bg }]}>
              <ThemedText type="smallBold" style={{ color: STATUS_META.Partial.color }}>
                {formatCurrency(collected)} has already been collected
              </ThemedText>
              <ThemedText type="small" style={{ color: STATUS_META.Partial.color, lineHeight: 18 }}>
                Voiding does not refund it. That money was really taken and stays
                in the payment ledger and in Daily Cash. If it is going back to
                the customer, reverse the payments separately.
              </ThemedText>
            </View>
          )}

          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>
            Type <ThemedText type="smallBold">{receiptId}</ThemedText> to confirm
          </ThemedText>
          <TextInput
            value={typedId}
            onChangeText={setTypedId}
            placeholder={receiptId}
            placeholderTextColor={theme.onSurfaceVariant}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[
              styles.input,
              {
                color: theme.onSurface,
                borderColor: typedId.length === 0
                  ? theme.outlineVariant
                  : idMatches ? STATUS_META.Paid.color : theme.error,
              },
            ]}
          />

          <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.label}>
            Why is it being voided?
          </ThemedText>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. customer cancelled, entered twice"
            placeholderTextColor={theme.onSurfaceVariant}
            style={[styles.input, { color: theme.onSurface, borderColor: theme.outlineVariant }]}
          />
          <ThemedText type="small" themeColor="onSurfaceVariant">
            The reason is stored on the record and shown to anyone who opens it.
          </ThemedText>

          <View style={styles.actions}>
            <Pressable onPress={close} style={[styles.btn, { borderColor: theme.outlineVariant }]}>
              <Text style={{ color: theme.onSurface, fontWeight: '600' }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => canConfirm && onConfirm(reason.trim())}
              disabled={!canConfirm}
              style={[
                styles.btn,
                {
                  backgroundColor: canConfirm ? theme.error : theme.surfaceVariant,
                  borderColor: 'transparent',
                },
              ]}
            >
              <Text
                style={{
                  color: canConfirm ? theme.onError ?? '#fff' : theme.onSurfaceVariant,
                  fontWeight: '700',
                }}
              >
                {isSubmitting ? 'Voiding…' : `Void ${kind}`}
              </Text>
            </Pressable>
          </View>
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
  body: { lineHeight: 18 },
  warn: { padding: Spacing.three, borderRadius: 12, gap: Spacing.one, marginTop: Spacing.two },
  label: { marginTop: Spacing.two },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    fontSize: 16,
  },
  actions: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.three },
  btn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
});
