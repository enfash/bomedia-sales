import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { SymbolView } from 'expo-symbols';
import { PrimaryButton } from './primary-button';


export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * @description Component to catch and display errors gracefully with a retry action.
 * @props ErrorStateProps (title, message, onRetry, style)
 * @example
 * <ErrorState 
 *   message="Failed to load records. Please check your connection." 
 *   onRetry={fetchRecords} 
 * />
 * @variants Centered layout, utilizes theme.colors.error for emphasis.
 * @accessibility 
 * - Visually warns the user of a failure and provides a clear recovery path.
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  style,
}: ErrorStateProps) {
  const theme = useTheme();

  return (
    <View style={[styles.container, style]}>
      <SymbolView name="exclamationmark.triangle" size={48} tintColor={theme.colors.error || '#EF4444'} style={styles.icon} />
      <Text variant="titleLarge" style={[styles.title, { color: theme.colors.error }]}>
        {title}
      </Text>
      <Text variant="bodyMedium" style={styles.message}>
        {message}
      </Text>
      {onRetry && (
        <PrimaryButton onPress={onRetry} style={styles.retryButton} icon="refresh">
          Retry
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
  retryButton: {
    minWidth: 160,
  },
});
