import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Surface } from 'react-native-paper';

interface StatCardProps {
  label: string;
  value: string;
  icon: SymbolViewProps['name'];
  accent: string;
  caption?: string;
  captionColor?: string;
}

/** A KPI tile for the dashboard: labelled figure with an accented icon chip and
 *  an optional caption (context or delta). */
export function StatCard({ label, value, icon, accent, caption, captionColor }: StatCardProps) {
  const theme = useTheme();

  return (
    <Surface
      elevation={0}
      style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
    >
      <View style={styles.top}>
        <View style={[styles.iconChip, { backgroundColor: accent + '1A' }]}>
          <SymbolView name={icon} size={18} tintColor={accent} />
        </View>
        <ThemedText type="smallBold" themeColor="onSurfaceVariant" style={styles.label}>
          {label}
        </ThemedText>
      </View>

      <ThemedText style={styles.value}>{value}</ThemedText>

      {caption ? (
        <ThemedText type="small" style={{ color: captionColor || theme.onSurfaceVariant }}>
          {caption}
        </ThemedText>
      ) : null}
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 210,
    borderWidth: 1,
    borderRadius: 18,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconChip: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 11,
    flexShrink: 1,
  },
  value: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
});
