import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/utils/color';
import { formatCurrency } from '@/utils/currency';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { StyleSheet, View } from 'react-native';

interface TransactionItemRowProps {
  material: string;
  width: number | string;
  height: number | string;
  jobUnit: string;
  quantity: number;
  total: number;
  /** Draw a hairline separator above the row (skip on the first item). */
  showDivider?: boolean;
}

export function TransactionItemRow({
  material,
  width,
  height,
  jobUnit,
  quantity,
  total,
  showDivider,
}: TransactionItemRowProps) {
  const theme = useTheme();

  return (
    <View style={[styles.row, showDivider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.outlineVariant }]}>
      <View style={[styles.swatch, { backgroundColor: withAlpha(theme.primary, 0.1), borderColor: theme.outlineVariant }]}>
        <SymbolView name={{ ios: 'photo', android: 'image', web: 'image' }} size={19} tintColor={theme.primary} />
      </View>

      <View style={styles.body}>
        <ThemedText style={styles.mat} numberOfLines={1}>{material}</ThemedText>
        <View style={styles.specRow}>
          <View style={[styles.qty, { backgroundColor: withAlpha(theme.onSurface, 0.06), borderColor: theme.outlineVariant }]}>
            <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.qtyText}>×{quantity}</ThemedText>
          </View>
          <ThemedText type="small" themeColor="onSurfaceVariant" numberOfLines={1}>
            {width} × {height} {jobUnit}
          </ThemedText>
        </View>
      </View>

      <ThemedText style={styles.amt}>{formatCurrency(total)}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.one,
  },
  swatch: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 3,
  },
  mat: {
    fontWeight: '700',
    fontSize: 14.5,
    letterSpacing: -0.2,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  qty: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  qtyText: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  amt: {
    fontWeight: '700',
    fontSize: 14.5,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
  },
});
