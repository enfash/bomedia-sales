import type { BatchAdjustment } from '@/components/records/types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/currency';
import { STATUS_META } from '@/utils/payment-status';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Surface } from 'react-native-paper';

interface TransactionCostBreakdownProps {
  /** Sum of the rounded line totals — never a figure derived by subtraction. */
  subtotal: number;
  /**
   * Every naira between the subtotal and the grand total, itemised. Delivery
   * is one of these rows; it is no longer passed separately.
   */
  adjustments: BatchAdjustment[];
  vat: number;
  grandTotal: number;
  amountPaid: number;
  totalBalance: number;
}

const money = (n: number) => formatCurrency(n);

export function TransactionCostBreakdown({
  subtotal,
  adjustments,
  vat,
  grandTotal,
  amountPaid,
  totalBalance,
}: TransactionCostBreakdownProps) {
  const theme = useTheme();

  return (
    <Surface
      style={[styles.card, { backgroundColor: theme.elevation?.level1 || theme.surface }]}
      elevation={0}
    >
      <Row label="Subtotal" value={money(subtotal)} muted theme={theme} />
      {adjustments.map((adjustment, i) => (
        <Row
          key={`${adjustment.kind}-${i}`}
          label={adjustment.label}
          value={`${adjustment.amount < 0 ? '−' : '+'}${money(Math.abs(adjustment.amount))}`}
          muted
          theme={theme}
        />
      ))}
      <Row label="VAT (0%)" value={money(vat)} muted theme={theme} />

      <View style={[styles.rule, { backgroundColor: theme.outlineVariant }]} />

      <Row label="Grand total" value={money(grandTotal)} emphasize theme={theme} />
      <Row label="Amount paid" value={`−${money(amountPaid)}`} credit theme={theme} />

      <View style={[styles.rule, { backgroundColor: theme.outlineVariant }]} />

      <View style={styles.row}>
        <ThemedText style={{ fontWeight: '700' }}>Outstanding balance</ThemedText>
        <ThemedText
          style={[
            styles.value,
            styles.due,
            { color: totalBalance > 0 ? STATUS_META.Unpaid.color : STATUS_META.Paid.color },
          ]}
        >
          {money(totalBalance)}
        </ThemedText>
      </View>
    </Surface>
  );
}

function Row({
  label,
  value,
  muted,
  emphasize,
  credit,
  theme,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasize?: boolean;
  credit?: boolean;
  theme: any;
}) {
  return (
    <View style={styles.row}>
      <ThemedText
        themeColor={muted ? 'onSurfaceVariant' : undefined}
        style={emphasize ? { fontWeight: '700', fontSize: 15 } : undefined}
      >
        {label}
      </ThemedText>
      <ThemedText
        style={[
          styles.value,
          emphasize && { fontWeight: '800', fontSize: 16 },
          credit && { color: STATUS_META.Paid.color },
        ]}
      >
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    borderRadius: 22,
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  value: {
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  due: { fontWeight: '800' },
  rule: { height: StyleSheet.hairlineWidth, marginVertical: 2 },
});
