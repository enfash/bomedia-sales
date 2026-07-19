import React from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Platform } from 'react-native';
import { Surface, Text, Avatar } from 'react-native-paper';
import { StatusChip, StatusType } from './status-chip';

export interface TransactionCardProps {
  customerName: string;
  status: StatusType | string;
  date: string;
  total: string;
  itemCount: number;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
}

/**
 * @description Standardized card for displaying transaction or sales records. Employs Progressive Disclosure.
 * @props TransactionCardProps (customerName, status, date, total, itemCount, style, onPress)
 * @example
 * <TransactionCard 
 *   customerName="Acme Corp" 
 *   status="Paid" 
 *   date="2023-10-01" 
 *   total="$1,500.00" 
 *   itemCount={3} 
 * />
 * @variants Elevated Surface (1dp)
 * @accessibility 
 * - Groups related transaction data together.
 * - Status chip adds visual context.
 */
export function TransactionCard({
  customerName,
  status,
  date,
  total,
  itemCount,
  style,
  onPress,
}: TransactionCardProps) {
  return (
    <Surface
      style={[styles.card, style]}
      elevation={1}
      onTouchEnd={onPress}
    >
      <View style={styles.cardContent}>
        <Avatar.Text 
          size={40} 
          label={customerName.substring(0, 2).toUpperCase()} 
          style={styles.avatar} 
        />
        <View style={styles.detailsContainer}>
          <View style={styles.header}>
        <Text variant="titleMedium" style={styles.customerName}>
          {customerName}
        </Text>
        <Text variant="titleMedium" style={styles.total}>
          {total}
        </Text>
      </View>
      
      <View style={styles.footer}>
        <StatusChip status={status} />
        <View style={styles.metaInfo}>
          <Text variant="bodySmall" style={styles.metaText}>
            {date}
          </Text>
          <Text variant="bodySmall" style={styles.metaText}>
            •
          </Text>
          <Text variant="bodySmall" style={styles.metaText}>
            {itemCount} item{itemCount !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>
        </View>
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
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    marginRight: 16,
  },
  detailsContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  customerName: {
    fontWeight: '600',
    flex: 1,
  },
  total: {
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    color: '#6B7280',
  },
});
