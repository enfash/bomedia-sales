/**
 * Single source of truth for payment status: the canonical vocabulary, the
 * colours each status maps to, and the rule that derives status from amounts.
 *
 * Every screen must render status through {@link STATUS_META} so the label and
 * colour of "Partial", "Paid", etc. are identical everywhere.
 */

import type { PaymentStatus } from '@/components/records/types';

export type { PaymentStatus };

export interface StatusMeta {
  label: string;
  /** Foreground / text colour. */
  color: string;
  /** Container / chip background colour. */
  bg: string;
  /**
   * Chip treatment. `filled` reads as more urgent than `outlined` and is
   * reserved for states needing action now — colour alone is not enough to
   * separate them for anyone with a red-green deficiency.
   */
  variant: 'filled' | 'outlined';
}

/** The one place status colours are defined. Semantic palette, brand-aligned. */
export const STATUS_META: Record<PaymentStatus, StatusMeta> = {
  Paid:     { label: 'Paid',           color: '#1c7d4d', bg: '#d9f2e4', variant: 'outlined' },
  Partial:  { label: 'Partially paid', color: '#b26a00', bg: '#ffeccc', variant: 'outlined' },
  Unpaid:   { label: 'Unpaid',         color: '#ba1a1a', bg: '#ffdad6', variant: 'outlined' },
  // Overdue was byte-identical to Unpaid — same colour, same background — so
  // the one status needing action today was indistinguishable from the one
  // that does not. Deeper red plus a filled chip, so it separates by shape as
  // well as by hue.
  Overdue:  { label: 'Overdue',        color: '#ffffff', bg: '#8c0009', variant: 'filled' },
  Overpaid: { label: 'Overpaid',       color: '#2e388d', bg: '#e5eeff', variant: 'outlined' },
};

export interface PaymentStatusData {
  status: PaymentStatus;
  color: string;
  backgroundColor: string;
}

/**
 * Derives payment status purely from the batch totals. This is the only rule;
 * stored `status` strings are ignored on read.
 */
export function getPaymentStatus(
  totalAmount: number,
  totalPaid: number,
  isOverdue = false,
): PaymentStatusData {
  const status = computePaymentStatus(totalAmount, totalPaid, isOverdue);
  const meta = STATUS_META[status];
  return { status, color: meta.color, backgroundColor: meta.bg };
}

/** Just the status enum (no colours). */
export function computePaymentStatus(
  totalAmount: number,
  totalPaid: number,
  isOverdue = false,
): PaymentStatus {
  if (totalPaid > totalAmount && totalAmount > 0) return 'Overpaid';
  if (totalPaid >= totalAmount && totalAmount > 0) return 'Paid';
  if (totalPaid > 0) return 'Partial';
  return isOverdue ? 'Overdue' : 'Unpaid';
}

/**
 * Colour resolver for manual/free-text statuses used outside sales
 * (e.g. quote pipeline: Won / Lost / Negotiation). Falls back to a neutral.
 */
export function getStatusColors(statusText: string): { text: string; bg: string } {
  if (statusText in STATUS_META) {
    const meta = STATUS_META[statusText as PaymentStatus];
    return { text: meta.color, bg: meta.bg };
  }
  switch (statusText) {
    case 'Won':
    case 'Approved':
      return { text: STATUS_META.Paid.color, bg: STATUS_META.Paid.bg };
    case 'Negotiation':
      return { text: STATUS_META.Partial.color, bg: STATUS_META.Partial.bg };
    case 'Rejected':
    case 'Lost':
      return { text: STATUS_META.Unpaid.color, bg: STATUS_META.Unpaid.bg };
    case 'Cancelled':
      return { text: '#546E7A', bg: '#ECEFF1' };
    default:
      return { text: '#454651', bg: '#eff4ff' };
  }
}
