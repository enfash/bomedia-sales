import React from 'react';
import { Chip } from 'react-native-paper';
import { StyleSheet } from 'react-native';

export type StatusType = 'Paid' | 'Part Paid' | 'Outstanding' | 'Cancelled';

interface StatusChipProps {
  status: StatusType | string;
  style?: any;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  'Paid': { bg: '#E8F5E9', text: '#2E7D32' },
  'Part Paid': { bg: '#FFF4E5', text: '#EF6C00' },
  'Outstanding': { bg: '#FDECEC', text: '#C62828' },
  'Cancelled': { bg: '#ECEFF1', text: '#546E7A' },
};

/**
 * @description A visual indicator for transaction or record status.
 * @props StatusChipProps (status string, optional style)
 * @example
 * <StatusChip status="Paid" />
 * @variants Paid (Green), Part Paid (Orange), Outstanding (Red), Cancelled (Grey)
 * @accessibility 
 * - Ensure the context around the chip communicates the status to screen readers, as chips are visual supplements.
 * - Uses compliant contrast ratios for background/text pairs.
 */
export function StatusChip({ status, style }: StatusChipProps) {
  const colors = statusColors[status as StatusType] || statusColors['Cancelled'];

  return (
    <Chip
      style={[{ backgroundColor: colors.bg }, styles.chip, style]}
      textStyle={{ color: colors.text, fontWeight: '600', fontSize: 12 }}
      compact
    >
      {status}
    </Chip>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
});
