import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Text } from 'react-native-paper';
import { SymbolView, SymbolViewProps } from 'expo-symbols';
import { PrimaryButton } from './primary-button';

export interface EmptyStateProps {
  iconName?: SymbolViewProps['name'];
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * @description Standard view for displaying empty datasets or missing content.
 * @props EmptyStateProps (iconName, title, message, actionLabel, onAction, style)
 * @example
 * <EmptyState 
 *   title="No Customers Found" 
 *   message="Try adjusting your filters or adding a new customer." 
 *   actionLabel="Add Customer" 
 *   onAction={() => router.push('/new-customer')}
 * />
 * @variants Centered layout with optional action button.
 * @accessibility 
 * - Communicates the absence of data clearly before prompting action.
 */
export function EmptyState({
  iconName = 'doc.text.magnifyingglass',
  title,
  message,
  actionLabel,
  onAction,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.container, style]}>
      <SymbolView name={iconName} size={64} tintColor="#9CA3AF" style={styles.icon} />
      <Text variant="titleLarge" style={styles.title}>
        {title}
      </Text>
      <Text variant="bodyMedium" style={styles.message}>
        {message}
      </Text>
      {actionLabel && onAction && (
        <PrimaryButton onPress={onAction} style={styles.actionButton}>
          {actionLabel}
        </PrimaryButton>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  actionButton: {
    minWidth: 160,
  },
});
