import type { PaymentEntry } from '@/components/records/types';
import { roundNaira } from '@/utils/money';

/**
 * What a staff member cannot see on a sale, derived from what she can.
 *
 * Payments are bucketed by who took them — `payments/{day}/{uid}/{key}` — and
 * the rules let a staff account read only its own uid. So her payment list is
 * legitimately incomplete, and a short list reads as "no payment was taken",
 * which is how a second payment gets recorded for money already collected.
 *
 * NO NEW READ AND NO RULES CHANGE. Both figures come from data she can already
 * see on the sale node:
 *
 *   hidden amount = totalPaid            − sum of her own entries
 *   hidden count  = number of paymentRefs − number of her own entries
 *
 * `totalPaid` counts everyone's payments and `paymentRefs` indexes every entry
 * on the sale, so the difference is precisely what belongs to someone else.
 */

export interface HiddenPayments {
  amount: number;
  count: number;
}

/**
 * `null`     nothing is hidden — say nothing at all
 * `unknown`  the figures disagree — say the generic warning, never a number
 */
export type HiddenResult = HiddenPayments | null | 'unknown';

export function deriveHiddenPayments(input: {
  totalPaid: number;
  refCount: number;
  visible: Pick<PaymentEntry, 'amount'>[];
}): HiddenResult {
  const visibleTotal = roundNaira(input.visible.reduce((sum, p) => sum + (p.amount || 0), 0));
  const amount = roundNaira((input.totalPaid || 0) - visibleTotal);
  const count = (input.refCount || 0) - input.visible.length;

  // Nothing to report: everything on this sale is hers.
  if (amount === 0 && count === 0) return null;

  // A wrong number is worse than the vague warning it would replace. Any of
  // these means the two sources disagree, and the operator must not be handed
  // a figure derived from a disagreement:
  //
  //  - negative amount: her own entries sum to more than totalPaid, which
  //    happens if a colleague's REVERSAL is hidden from her
  //  - negative count: more visible entries than the index knows about
  //  - one positive and the other zero: money with no entry behind it, or an
  //    entry with no money — either way the pair cannot be described
  if (amount < 0 || count < 0) return 'unknown';
  if (amount > 0 !== count > 0) return 'unknown';

  return { amount, count };
}
