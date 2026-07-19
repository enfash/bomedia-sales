import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Surface } from 'react-native-paper';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/currency';
import { Spacing } from '@/constants/theme';

interface TransactionCostBreakdownProps {
  subtotal: number;
  vat: number;
  grandTotal: number;
  amountPaid: number;
  totalBalance: number;
}

export function TransactionCostBreakdown({
  subtotal,
  vat,
  grandTotal,
  amountPaid,
  totalBalance,
}: TransactionCostBreakdownProps) {
  const theme = useTheme();

  return (
    <Surface
      style={[
        styles.card,
        { backgroundColor: theme.elevation?.level1 || theme.surface }
      ]}
      elevation={0}
    >
      <View style={styles.breakdownRow}>
        <ThemedText themeColor="onSurfaceVariant">Subtotal:</ThemedText>
        <ThemedText>{formatCurrency(subtotal)}</ThemedText>
      </View>
      <View style={styles.breakdownRow}>
        <ThemedText themeColor="onSurfaceVariant">VAT (0%):</ThemedText>
        <ThemedText>{formatCurrency(vat)}</ThemedText>
      </View>
      
      <View style={[styles.breakdownRow, { marginTop: Spacing.two, marginBottom: Spacing.four }]}>
        <ThemedText style={{ fontWeight: '700', fontSize: 16 }}>Grand Total:</ThemedText>
        <ThemedText style={{ fontWeight: '700', fontSize: 16 }}>{formatCurrency(grandTotal)}</ThemedText>
      </View>

      <View style={styles.breakdownRow}>
        <ThemedText themeColor="onSurfaceVariant">Amount Paid:</ThemedText>
        <ThemedText>{formatCurrency(amountPaid)}</ThemedText>
      </View>
      
      <View style={[styles.breakdownRow, { marginTop: Spacing.one }]}>
        <ThemedText style={{ fontWeight: '700' }}>Outstanding Balance:</ThemedText>
        <ThemedText style={{ fontWeight: '700', color: totalBalance > 0 ? theme.error : '#2E7D32' }}>
          {formatCurrency(totalBalance)}
        </ThemedText>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.six,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
});
