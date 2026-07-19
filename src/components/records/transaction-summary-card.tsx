import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Surface } from 'react-native-paper';
import { ThemedText } from '@/components/themed-text';
import { StatusChip } from '@/components/ui/status-chip';
import { useTheme } from '@/hooks/use-theme';
import { formatCurrency } from '@/utils/currency';
import { formatDate } from '@/utils/date';
import { Spacing } from '@/constants/theme';
import { SymbolView } from 'expo-symbols';

interface TransactionSummaryCardProps {
  grandTotal: number;
  clientName: string;
  transactionId: string;
  createdAt: number | string;
  status: 'Paid' | 'Partial' | 'Unpaid';
}

export function TransactionSummaryCard({
  grandTotal,
  clientName,
  transactionId,
  createdAt,
  status,
}: TransactionSummaryCardProps) {
  const theme = useTheme();

  return (
    <Surface
      style={[
        styles.card,
        { backgroundColor: theme.elevation?.level1 || theme.surface }
      ]}
      elevation={0}
    >
      <View style={styles.headerRow}>
        <ThemedText style={styles.grandTotal}>
          {formatCurrency(grandTotal)}
        </ThemedText>
        <StatusChip status={status} />
      </View>

      <View style={{ marginTop: Spacing.four }}>
        <ThemedText type="subtitle" style={{ fontSize: 20 }}>
          {clientName || 'Unknown Client'}
        </ThemedText>
      </View>

      <View style={[styles.metaRow, { marginTop: Spacing.four }]}>
        <View style={styles.metaItem}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <SymbolView name={{ ios: 'doc.text', android: 'description', web: 'description' }} size={16} tintColor={theme.onSurfaceVariant} style={{ marginRight: 8 }} />
            <ThemedText type="small" themeColor="onSurfaceVariant">Invoice</ThemedText>
          </View>
          <ThemedText style={{ fontWeight: '600' }}>#{transactionId.substring(0, 8).toUpperCase()}</ThemedText>
        </View>

        <View style={styles.metaItem}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
            <SymbolView name={{ ios: 'calendar', android: 'calendar_today', web: 'calendar_today' }} size={16} tintColor={theme.onSurfaceVariant} style={{ marginRight: 8 }} />
            <ThemedText type="small" themeColor="onSurfaceVariant">Date</ThemedText>
          </View>
          <ThemedText style={{ fontWeight: '600' }}>{formatDate(createdAt)}</ThemedText>
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.six,
    paddingVertical: 32,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  headerRow: {
    alignItems: 'center',
    gap: Spacing.three,
  },
  grandTotal: {
    fontSize: 48,
    lineHeight: 56,
    fontWeight: '800',
    letterSpacing: -1,
  },
  metaRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    paddingTop: Spacing.six,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  metaItem: {
    flex: 1,
    alignItems: 'center',
  },
});
