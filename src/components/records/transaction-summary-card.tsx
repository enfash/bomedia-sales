import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/utils/color';
import { formatCurrency } from '@/utils/currency';
import { STATUS_META } from '@/utils/payment-status';
import type { PaymentMethod, PaymentStatus } from '@/components/records/types';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Surface } from 'react-native-paper';

interface TransactionSummaryCardProps {
  totalAmount: number;
  totalPaid: number;
  totalBalance: number;
  status: PaymentStatus;
  paymentMethod?: PaymentMethod;
}

const METHOD_ICON = {
  Transfer: { ios: 'creditcard', android: 'credit_card', web: 'credit_card' },
  Cash: { ios: 'banknote', android: 'payments', web: 'payments' },
  POS: { ios: 'wave.3.right', android: 'contactless', web: 'contactless' },
} as const;

/**
 * Payment-first hero for the Transaction Details screen. Leads with the balance
 * due and a collection-progress bar so "how much is left to collect" reads at a
 * glance. Status is encoded three ways: the pill, the bar colour, and the figure.
 */
export function TransactionSummaryCard({
  totalAmount,
  totalPaid,
  totalBalance,
  status,
  paymentMethod,
}: TransactionSummaryCardProps) {
  const theme = useTheme();
  const meta = STATUS_META[status];

  const pct = totalAmount > 0 ? Math.min(Math.max(totalPaid / totalAmount, 0), 1) : 0;
  const balanceDue = Math.max(totalBalance, 0);
  const overpaid = totalBalance < 0;

  return (
    <Surface
      style={[styles.card, { backgroundColor: theme.elevation?.level1 || theme.surface }]}
      elevation={0}
    >
      {/* Status + method */}
      <View style={styles.topRow}>
        <View style={[styles.pill, { backgroundColor: meta.bg }]}>
          <View style={[styles.dot, { backgroundColor: meta.color }]} />
          <ThemedText style={[styles.pillText, { color: meta.color }]}>{meta.label}</ThemedText>
        </View>

        {paymentMethod ? (
          <View style={styles.method}>
            <SymbolView
              name={METHOD_ICON[paymentMethod]}
              size={15}
              tintColor={theme.onSurfaceVariant}
            />
            <ThemedText type="small" themeColor="onSurfaceVariant" style={{ fontWeight: '600' }}>
              {paymentMethod}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {/* Balance due */}
      <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.balanceLabel}>
        {overpaid ? 'CREDIT BALANCE' : 'BALANCE DUE'}
      </ThemedText>
      <View style={styles.balanceRow}>
        <ThemedText style={[styles.currency, { color: theme.onSurfaceVariant }]}>₦</ThemedText>
        <ThemedText style={styles.balance}>
          {formatCurrency(overpaid ? -totalBalance : balanceDue).replace('₦', '')}
        </ThemedText>
      </View>

      {/* Collection progress */}
      <View style={[styles.track, { backgroundColor: withAlpha(theme.primary, 0.14) }]}>
        <View style={[styles.fill, { width: `${pct * 100}%`, backgroundColor: theme.primary }]} />
      </View>

      <View style={styles.split}>
        <View>
          <ThemedText type="small" themeColor="onSurfaceVariant">Collected</ThemedText>
          <ThemedText style={[styles.splitValue, { color: STATUS_META.Paid.color }]}>
            {formatCurrency(totalPaid)}
          </ThemedText>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <ThemedText type="small" themeColor="onSurfaceVariant">Invoice total</ThemedText>
          <ThemedText style={styles.splitValue}>{formatCurrency(totalAmount)}</ThemedText>
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.four,
    borderRadius: 22,
    gap: Spacing.two,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  pillText: { fontSize: 12.5, fontWeight: '700' },
  method: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  balanceLabel: {
    marginTop: Spacing.four,
    letterSpacing: 1,
    fontWeight: '700',
  },
  balanceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 2 },
  currency: { fontSize: 26, fontWeight: '700', marginTop: 6 },
  balance: {
    fontSize: 50,
    lineHeight: 54,
    fontWeight: '800',
    letterSpacing: -1.6,
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: Spacing.four,
    marginBottom: Spacing.three,
  },
  fill: { height: '100%', borderRadius: 999 },
  split: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  splitValue: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 2,
    fontVariant: ['tabular-nums'],
  },
});
