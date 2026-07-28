import { STATUS_META, getStatusColors, type PaymentStatus } from '@/utils/payment-status';
import React from 'react';
import { StyleSheet } from 'react-native';
import { Chip } from 'react-native-paper';

/** @deprecated Use PaymentStatus. Kept as a loose alias for older callers. */
export type StatusType = PaymentStatus | string;

interface StatusChipProps {
  status: PaymentStatus | string;
  style?: any;
}

/**
 * @description Visual indicator for a payment/record status. Colours and labels
 * come from the shared STATUS_META so every screen stays consistent.
 * @example <StatusChip status="Partial" />
 * @variants Paid (green), Partial (amber), Unpaid/Overdue (red), Overpaid (brand).
 * @accessibility Ensure surrounding context conveys status to screen readers;
 * the chip is a visual supplement. Contrast pairs meet WCAG AA.
 */
export function StatusChip({ status, style }: StatusChipProps) {
  const meta = (status in STATUS_META) ? STATUS_META[status as PaymentStatus] : null;
  const colors = meta ? { text: meta.color, bg: meta.bg } : getStatusColors(String(status));
  const label = meta ? meta.label : String(status);

  return (
    <Chip
      style={[{ backgroundColor: colors.bg }, styles.chip, style]}
      textStyle={{ color: colors.text, fontWeight: '600', fontSize: 12 }}
      compact
    >
      {label}
    </Chip>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
});
