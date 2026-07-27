import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { RangePreset } from '@/services/analytics';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

const PRESETS: { label: string; value: RangePreset }[] = [
  { label: 'Today', value: 'today' },
  { label: '1M', value: '1m' },
  { label: '3M', value: '3m' },
  { label: '6M', value: '6m' },
  { label: '12M', value: '12m' },
  { label: 'Custom', value: 'custom' },
];

interface RangeControlProps {
  value: RangePreset;
  onChange: (v: RangePreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStart: (v: string) => void;
  onCustomEnd: (v: string) => void;
}

/**
 * Web-only date-range control (Today / 1M / 3M / 6M / 12M / Custom). Rendered in
 * the dashboard + Analytics app bar; the mobile Home stays fixed to "today".
 */
export function RangeControl({ value, onChange, customStart, customEnd, onCustomStart, onCustomEnd }: RangeControlProps) {
  const theme = useTheme();

  return (
    <View style={styles.wrap}>
      <View style={[styles.segment, { borderColor: theme.outlineVariant }]}>
        {PRESETS.map((p) => {
          const active = value === p.value;
          return (
            <Pressable
              key={p.value}
              onPress={() => onChange(p.value)}
              style={[styles.item, active && { backgroundColor: theme.primary }]}
            >
              <ThemedText type="smallBold" style={{ color: active ? theme.onPrimary : theme.onSurfaceVariant, fontSize: 12 }}>
                {p.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      {value === 'custom' ? (
        <View style={styles.custom}>
          <DateField value={customStart} onChange={onCustomStart} border={theme.outlineVariant} ink={theme.onSurface} />
          <ThemedText type="small" themeColor="onSurfaceVariant">to</ThemedText>
          <DateField value={customEnd} onChange={onCustomEnd} border={theme.outlineVariant} ink={theme.onSurface} />
        </View>
      ) : null}
    </View>
  );
}

/** Native `<input type="date">` — this component only ever renders on web. */
function DateField({ value, onChange, border, ink }: { value: string; onChange: (v: string) => void; border: string; ink: string }) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange((e.target as HTMLInputElement).value)}
      style={{
        border: `1px solid ${border}`,
        borderRadius: 8,
        padding: '6px 8px',
        fontSize: 13,
        background: 'transparent',
        color: ink,
        colorScheme: 'light dark',
        fontFamily: 'inherit',
      }}
    />
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  item: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
  },
  custom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
