import type { PaymentEntry } from '@/components/records/types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { STATUS_META } from '@/utils/payment-status';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Surface } from 'react-native-paper';

interface PaymentHistoryProps {
  payments: PaymentEntry[];
  theme: any;
  /**
   * Staff only receive their own entries from the database, so their view is
   * legitimately incomplete. Say so rather than implying the list is the whole
   * story — an operator who thinks a payment is missing will record it twice.
   */
  isPartialView?: boolean;
  /** Admin-only. Omitted for staff, who cannot reverse. */
  onReverse?: (entry: PaymentEntry) => void;
  /** Plain-language mismatch line, when the ledger and the cached total differ. */
  mismatchMessage?: string;
  onRecalculate?: () => void;
}

export function PaymentHistory({
  payments,
  theme,
  isPartialView = false,
  onReverse,
  mismatchMessage,
  onRecalculate,
}: PaymentHistoryProps) {
  return (
    <Surface
      style={[styles.card, { backgroundColor: theme.elevation?.level1 || theme.surface }]}
      elevation={0}
    >
      <View style={styles.header}>
        <ThemedText type="defaultSemiBold">Payment history</ThemedText>
        <ThemedText type="small" themeColor="onSurfaceVariant">
          {payments.length === 0 ? 'None yet' : `${payments.length} entr${payments.length === 1 ? 'y' : 'ies'}`}
        </ThemedText>
      </View>

      {mismatchMessage && (
        <View style={[styles.mismatch, { backgroundColor: STATUS_META.Partial.bg }]}>
          <ThemedText type="small" style={{ color: STATUS_META.Partial.color, lineHeight: 18 }}>
            {mismatchMessage}
          </ThemedText>
          {onRecalculate && (
            <Pressable onPress={onRecalculate} hitSlop={8} style={styles.recalc}>
              <ThemedText type="smallBold" style={{ color: STATUS_META.Partial.color }}>
                Recalculate
              </ThemedText>
            </Pressable>
          )}
        </View>
      )}

      {payments.length === 0 && (
        <ThemedText type="small" themeColor="onSurfaceVariant">
          Nothing has been collected against this sale yet.
        </ThemedText>
      )}

      {payments.map((p) => {
        const negative = p.amount < 0;
        return (
          <View key={p.id} style={[styles.row, { borderTopColor: theme.outlineVariant }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.line}>
                <ThemedText type="smallBold">
                  {p.isReversal ? 'Reversal' : p.method}
                </ThemedText>
                <ThemedText type="small" themeColor="onSurfaceVariant">
                  {' · '}{formatDate(p.at)}
                </ThemedText>
              </View>
              <ThemedText type="small" themeColor="onSurfaceVariant">
                Taken by {p.byName}
              </ThemedText>
              {p.isReversal && p.reversalReason && (
                <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.italic}>
                  Reason: {p.reversalReason}
                </ThemedText>
              )}
              {!p.isReversal && p.note && (
                <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.italic}>
                  {p.note}
                </ThemedText>
              )}
            </View>

            <View style={{ alignItems: 'flex-end', gap: Spacing.one }}>
              <ThemedText
                type="smallBold"
                style={{ color: negative ? STATUS_META.Unpaid.color : STATUS_META.Paid.color }}
              >
                {negative ? '−' : '+'}{formatCurrency(Math.abs(p.amount))}
              </ThemedText>
              {onReverse && !p.isReversal && (
                <Pressable onPress={() => onReverse(p)} hitSlop={8}>
                  <ThemedText type="small" style={{ color: theme.error }}>Reverse</ThemedText>
                </Pressable>
              )}
            </View>
          </View>
        );
      })}

      {isPartialView && (
        <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.footnote}>
          You can only see payments you took yourself. A colleague may have
          collected against this sale too — check with an admin before recording
          anything again.
        </ThemedText>
      )}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: { padding: Spacing.four, borderRadius: 22, gap: Spacing.three },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
  },
  line: { flexDirection: 'row', alignItems: 'center' },
  italic: { fontStyle: 'italic' },
  mismatch: { padding: Spacing.three, borderRadius: 12, gap: Spacing.two },
  recalc: { alignSelf: 'flex-start' },
  footnote: { lineHeight: 18, fontStyle: 'italic' },
});
