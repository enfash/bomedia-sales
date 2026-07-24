import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Surface } from 'react-native-paper';

interface PanelProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
}

/** A titled dashboard surface — the wrapper for charts, tables and lists. */
export function Panel({ title, subtitle, right, children, style, bodyStyle }: PanelProps) {
  const theme = useTheme();

  return (
    <Surface
      elevation={0}
      style={[styles.panel, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }, style]}
    >
      <View style={[styles.header, { borderBottomColor: theme.outlineVariant }]}>
        <View style={{ flex: 1 }}>
          <ThemedText type="defaultSemiBold" style={styles.title}>{title}</ThemedText>
          {subtitle ? (
            <ThemedText type="small" themeColor="onSurfaceVariant">{subtitle}</ThemedText>
          ) : null}
        </View>
        {right ? <View>{right}</View> : null}
      </View>

      <View style={[styles.body, bodyStyle]}>{children}</View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderWidth: 1,
    borderRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 15,
  },
  body: {
    padding: Spacing.four,
  },
});
