import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Platform } from 'react-native';
import { Surface, Text } from 'react-native-paper';

export interface ExpenseCardProps {
  description: string;
  category: string;
  date: string;
  amount: string;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

/**
 * @description Standardized card for displaying an expense record.
 * @props ExpenseCardProps (description, category, date, amount, style, onPress)
 * @example
 * <ExpenseCard 
 *   description="Office Supplies" 
 *   category="Materials" 
 *   date="Oct 12, 2023" 
 *   amount="₦5,000" 
 * />
 * @variants Elevated Surface (1dp)
 * @accessibility 
 * - Groups related expense data together.
 */
export function ExpenseCard({
  description,
  category,
  date,
  amount,
  style,
  onPress,
}: ExpenseCardProps) {
  return (
    <Surface
      style={[styles.card, style]}
      elevation={1}
      onTouchEnd={onPress}
    >
      <View style={styles.header}>
        <Text variant="titleMedium" style={styles.description} numberOfLines={2}>
          {description}
        </Text>
        <Text variant="titleMedium" style={styles.amount}>
          {amount}
        </Text>
      </View>
      
      <View style={styles.footer}>
        <View style={styles.categoryChip}>
          <Text variant="bodySmall" style={styles.categoryText} numberOfLines={1}>
            {category}
          </Text>
        </View>
        <Text variant="bodySmall" style={styles.dateText}>
          {date}
        </Text>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Platform.OS === 'web' ? 16 : 0,
    padding: 16,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  description: {
    fontWeight: '600',
    flex: 1,
    paddingRight: 16,
  },
  amount: {
    fontWeight: '700',
    color: '#FF3B30', // Or derive from theme if passed, hardcoded to match expenses convention usually
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  categoryChip: {
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    maxWidth: '60%',
  },
  categoryText: {
    fontWeight: '500',
  },
  dateText: {
    color: '#6B7280',
  },
});
