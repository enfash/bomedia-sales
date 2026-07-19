import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { formatCurrency } from '@/utils/currency';
import { Spacing } from '@/constants/theme';

interface TransactionItemRowProps {
  material: string;
  width: number | string;
  height: number | string;
  jobUnit: string;
  quantity: number;
  total: number;
}

export function TransactionItemRow({
  material,
  width,
  height,
  jobUnit,
  quantity,
  total,
}: TransactionItemRowProps) {
  return (
    <View style={styles.itemRow}>
      <View style={{ flex: 1, paddingRight: Spacing.four }}>
        <ThemedText style={{ fontWeight: '600' }}>{material}</ThemedText>
        <ThemedText type="small" themeColor="onSurfaceVariant" style={{ marginTop: 2 }}>
          {width}x{height} {jobUnit} • Qty: {quantity}
        </ThemedText>
      </View>
      <ThemedText style={{ fontWeight: '600', fontSize: 16 }}>
        {formatCurrency(total)}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.four,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
});
