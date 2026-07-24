import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/utils/color';
import { formatCurrency } from '@/utils/currency';
import type { CollectedSplit } from '@/services/analytics';
import { STATUS_META } from '@/utils/payment-status';
import React from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * Collected vs outstanding as a single stacked bar — the "one headline, two
 * parts" form. A 2px surface gap separates the fills; a legend + values name
 * each part so identity is never colour-alone.
 */
export function SplitBar({ split }: { split: CollectedSplit }) {
  const theme = useTheme();
  const collectedColor = STATUS_META.Paid.color;
  const outstandingColor = STATUS_META.Unpaid.color;

  const collectedPct = split.total > 0 ? (split.collected / split.total) * 100 : 0;
  const outstandingPct = split.total > 0 ? (split.outstanding / split.total) * 100 : 0;

  return (
    <View style={{ gap: Spacing.four }}>
      <View style={styles.headline}>
        <ThemedText style={styles.pct}>{split.collectedPct.toFixed(0)}%</ThemedText>
        <ThemedText type="small" themeColor="onSurfaceVariant">of billed revenue collected</ThemedText>
      </View>

      {split.total > 0 ? (
        <View style={styles.track}>
          {collectedPct > 0 ? (
            <View style={[styles.seg, { flex: split.collected, backgroundColor: collectedColor }]} />
          ) : null}
          {outstandingPct > 0 ? (
            <View style={[styles.seg, { flex: split.outstanding, backgroundColor: outstandingColor, marginLeft: 2 }]} />
          ) : null}
        </View>
      ) : (
        <View style={[styles.track, { backgroundColor: withAlpha(theme.onSurface, 0.06) }]} />
      )}

      <View style={styles.legendRow}>
        <LegendStat color={collectedColor} label="Collected" value={formatCurrency(split.collected)} />
        <LegendStat color={outstandingColor} label="Outstanding" value={formatCurrency(split.outstanding)} align="right" />
      </View>
    </View>
  );
}

function LegendStat({ color, label, value, align }: { color: string; label: string; value: string; align?: 'right' }) {
  return (
    <View style={[styles.legendStat, align === 'right' && { alignItems: 'flex-end' }]}>
      <View style={styles.legendLabel}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <ThemedText type="small" themeColor="onSurfaceVariant">{label}</ThemedText>
      </View>
      <ThemedText type="defaultSemiBold" style={{ fontVariant: ['tabular-nums'] }}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  headline: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.two,
  },
  pct: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  track: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
  },
  seg: {
    height: '100%',
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  legendStat: {
    gap: 4,
  },
  legendLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
});
