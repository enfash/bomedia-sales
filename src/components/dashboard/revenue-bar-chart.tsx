import { ThemedText } from '@/components/themed-text';
import type { MonthPoint } from '@/services/analytics';
import { useTheme } from '@/hooks/use-theme';
import React from 'react';
import { StyleSheet, View } from 'react-native';

const CHART_HEIGHT = 156;

/** Compact money label for the in-chart tag, e.g. ₦1.2m / ₦450k / ₦900. */
function compact(v: number): string {
  if (v >= 1_000_000) return `₦${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}m`;
  if (v >= 1_000) return `₦${(v / 1_000).toFixed(v >= 100_000 ? 0 : 1)}k`;
  return `₦${Math.round(v)}`;
}

/**
 * Monthly revenue as a bar chart, built from Views (no chart dependency).
 * Single-hue sequence with the current month emphasised — the endpoint carries
 * the eye, muted bars give context without competing.
 */
export function RevenueBarChart({ data }: { data: MonthPoint[] }) {
  const theme = useTheme();
  const max = Math.max(...data.map((d) => d.value), 1);
  const hasData = data.some((d) => d.value > 0);

  return (
    <View>
      <View style={[styles.chart, { height: CHART_HEIGHT, borderBottomColor: theme.outlineVariant }]}>
        {data.map((p) => {
          const h = p.value > 0 ? Math.max((p.value / max) * (CHART_HEIGHT - 22), 6) : 2;
          return (
            <View key={p.key} style={styles.col}>
              {p.isCurrent && p.value > 0 ? (
                <View style={[styles.tag, { backgroundColor: theme.primary }]}>
                  <ThemedText type="small" style={styles.tagText}>{compact(p.value)}</ThemedText>
                </View>
              ) : null}
              <View
                style={[
                  styles.bar,
                  {
                    height: h,
                    backgroundColor: p.isCurrent ? theme.primary : theme.primary + '2E',
                  },
                ]}
              />
            </View>
          );
        })}

        {!hasData ? (
          <View style={styles.emptyOverlay} pointerEvents="none">
            <ThemedText type="small" themeColor="onSurfaceVariant">No revenue recorded yet</ThemedText>
          </View>
        ) : null}
      </View>

      <View style={styles.labels}>
        {data.map((p) => (
          <ThemedText
            key={p.key}
            type="small"
            style={{
              flex: 1,
              textAlign: 'center',
              color: p.isCurrent ? theme.primary : theme.onSurfaceVariant,
              fontWeight: p.isCurrent ? '700' : '500',
            }}
          >
            {p.label}
          </ThemedText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 14,
    borderBottomWidth: 1,
    paddingBottom: 0,
  },
  col: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  bar: {
    width: '64%',
    maxWidth: 48,
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagText: {
    color: '#ffffff',
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  labels: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 8,
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
