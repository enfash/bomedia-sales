import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Surface } from 'react-native-paper';
import { SymbolView, SymbolViewProps } from 'expo-symbols';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export interface KPICardProps {
  title: string;
  value: string | number;
  iconName: SymbolViewProps['name'];
  iconColor: string;
  iconBackgroundColor: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * @description A summary card displaying a key performance indicator (KPI) with an icon.
 * @props KPICardProps (title, value, iconName, iconColor, iconBackgroundColor, style)
 * @example
 * <KPICard 
 *   title="Total Revenue" 
 *   value="$12,000" 
 *   iconName="dollarsign.circle" 
 *   iconColor="#FFF" 
 *   iconBackgroundColor="#2E388D" 
 * />
 * @variants Elevated Surface
 * @accessibility 
 * - Ensure icon color contrasts well against iconBackgroundColor.
 * - Reads as a single data point summary.
 */
export function KPICard({
  title,
  value,
  iconName,
  iconColor,
  iconBackgroundColor,
  style,
}: KPICardProps) {
  return (
    <Surface style={[styles.card, style]} elevation={1}>
      <View style={[styles.iconContainer, { backgroundColor: iconBackgroundColor }]}>
        <SymbolView name={iconName} size={20} tintColor={iconColor} />
      </View>
      <View style={styles.info}>
        <ThemedText type="small" themeColor="onSurfaceVariant">{title}</ThemedText>
        <ThemedText type="defaultSemiBold" style={styles.value}>{value}</ThemedText>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: Spacing.three, // 16
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three, // 16
  },
  info: {
    gap: 2,
  },
  value: {
    fontSize: 18,
  },
});
