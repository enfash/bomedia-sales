import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { withAlpha } from '@/utils/color';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export interface BarRow {
  /** Stable key + left-hand label. */
  label: string;
  value: number;
  /** Small muted note under the label (e.g. "12 jobs"). */
  caption?: string;
  /** Per-row bar colour. Falls back to the list `accent`. */
  accent?: string;
}

interface BarListProps {
  data: BarRow[];
  formatValue: (n: number) => string;
  /** Default bar colour (single-hue magnitude encoding). */
  accent?: string;
  emptyText?: string;
}

/**
 * Ranked horizontal bars — the form for "magnitude by category" (revenue by
 * material, top clients, jobs per stage). Bars share one scale so lengths are
 * comparable; each value is direct-labelled so the chart reads without a hover
 * layer. Labels/values use ink tokens; only the bar carries colour.
 */
export function BarList({ data, formatValue, accent, emptyText = 'No data yet' }: BarListProps) {
  const theme = useTheme();
  const barColor = accent ?? theme.primary;
  const max = Math.max(...data.map((d) => d.value), 1);
  const hasData = data.some((d) => d.value > 0);

  if (data.length === 0 || !hasData) {
    return (
      <View style={styles.empty}>
        <ThemedText type="small" themeColor="onSurfaceVariant">{emptyText}</ThemedText>
      </View>
    );
  }

  return (
    <View style={{ gap: Spacing.three }}>
      {data.map((row) => {
        const pct = max > 0 ? Math.max((row.value / max) * 100, row.value > 0 ? 2 : 0) : 0;
        return (
          <View key={row.label} style={styles.row}>
            <View style={styles.rowHead}>
              <View style={styles.labelWrap}>
                <ThemedText type="small" numberOfLines={1} style={styles.label}>{row.label}</ThemedText>
                {row.caption ? (
                  <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.caption}>{row.caption}</ThemedText>
                ) : null}
              </View>
              <ThemedText type="smallBold" style={styles.value}>{formatValue(row.value)}</ThemedText>
            </View>
            <View style={[styles.track, { backgroundColor: withAlpha(theme.onSurface, 0.06) }]}>
              <View style={[styles.fill, { width: `${pct}%`, backgroundColor: row.accent ?? barColor }]} />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.five,
  },
  row: {
    gap: 6,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  labelWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  label: {
    fontWeight: '600',
    flexShrink: 1,
  },
  caption: {
    fontSize: 11,
  },
  value: {
    fontVariant: ['tabular-nums'],
  },
  track: {
    height: 10,
    borderRadius: 5,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
    minWidth: 4,
  },
});
