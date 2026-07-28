import { ThemedText } from '@/components/themed-text';
import type { MonthMoney } from '@/services/analytics';
import { useTheme } from '@/hooks/use-theme';
import { STATUS_META } from '@/utils/payment-status';
import React from 'react';
import { StyleSheet, View } from 'react-native';

const CHART_HEIGHT = 168;

/** Compact money label, e.g. ₦1.2m / ₦450k / ₦900. */
function compact(v: number): string {
  if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}m`;
  if (v >= 1_000) return `₦${(v / 1_000).toFixed(v >= 100_000 ? 0 : 1)}k`;
  return `₦${Math.round(v)}`;
}

/**
 * Revenue vs expenses per month as grouped bars on ONE shared ₦ scale (never a
 * dual axis). Two clearly-separated hues + a legend carry identity; month labels
 * sit on the baseline. Built from Views — no chart dependency.
 */
export function MonthlyComparisonChart({ data }: { data: MonthMoney[] }) {
  const theme = useTheme();
  const revenueColor = theme.primary;
  const expenseColor = STATUS_META.Partial.color; // amber — distinct hue + lightness from indigo
  const max = Math.max(...data.flatMap((d) => [d.revenue, d.expenses]), 1);
  const hasData = data.some((d) => d.revenue > 0 || d.expenses > 0);

  return (
    <View>
      <View style={styles.legend}>
        <LegendDot color={revenueColor} label="Revenue" />
        <LegendDot color={expenseColor} label="Expenses" />
      </View>

      <View style={[styles.chart, { height: CHART_HEIGHT, borderBottomColor: theme.outlineVariant }]}>
        {data.map((p) => {
          const rH = p.revenue > 0 ? Math.max((p.revenue / max) * (CHART_HEIGHT - 20), 4) : 2;
          const eH = p.expenses > 0 ? Math.max((p.expenses / max) * (CHART_HEIGHT - 20), 4) : 2;
          return (
            <View key={p.key} style={styles.group}>
              <View style={styles.bars}>
                <View style={[styles.bar, { height: rH, backgroundColor: revenueColor }]} />
                <View style={[styles.bar, { height: eH, backgroundColor: expenseColor }]} />
              </View>
            </View>
          );
        })}

        {!hasData ? (
          <View style={[styles.emptyOverlay, { pointerEvents: 'none' }]}>
            <ThemedText type="small" themeColor="onSurfaceVariant">No revenue or expenses recorded yet</ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.labels}>
        {data.map((p) => (
          <View key={p.key} style={styles.labelCol}>
            <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.monthLabel}>{p.label}</ThemedText>
            {hasData ? (
              <ThemedText type="small" style={[styles.netLabel, { color: p.net >= 0 ? STATUS_META.Paid.color : STATUS_META.Unpaid.color }]}>
                {p.net >= 0 ? '+' : '−'}{compact(Math.abs(p.net))}
              </ThemedText>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <ThemedText type="small" themeColor="onSurfaceVariant">{label}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
  },
  group: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  bar: {
    width: 14,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  labels: {
    flexDirection: 'row',
    marginTop: 8,
  },
  labelCol: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  monthLabel: {
    fontWeight: '500',
  },
  netLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  emptyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
