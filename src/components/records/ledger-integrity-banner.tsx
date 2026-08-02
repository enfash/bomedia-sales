import type { PaymentEntry, SalesBatch } from '@/components/records/types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { attachPayments } from '@/services/payment-reconciliation';
import { subscribeToPaymentsInRange } from '@/services/payment-repository';
import { localDayKey } from '@/utils/date';
import { formatCurrency } from '@/utils/currency';
import { STATUS_META } from '@/utils/payment-status';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

/**
 * Surfaces sales whose cached `totalPaid` disagrees with the payment ledger.
 *
 * WHY THIS EXISTS — the accepted risk it compensates for:
 *
 * `totalPaid` must stay writable by staff, because `ServerValue.increment`
 * writes to that exact path and the rules cannot tell an increment apart from
 * an arbitrary assignment. So a staff account can, in principle, set
 * `totalPaid` to any number with no matching ledger entry. The application
 * never does this — every write goes through `recordPayment` — but the RULES
 * do not enforce it, and Stage 2's premise is that every naira in `totalPaid`
 * traces to an entry.
 *
 * This banner is the compensating control. It sits on the dashboard rather than
 * only on the cash page, because a check you have to remember to open is a
 * check that does not run.
 *
 * IT IS SCOPED, AND IT SAYS SO. Reading the whole ledger to check it does not
 * scale, and payments accumulate faster than sales. Scoping to a window is the
 * right trade — but it changes what the banner can claim. A gap one day outside
 * the window would otherwise produce silence, which is the exact failure this
 * was built to prevent, only quieter. So when the books agree it states the
 * period it checked; it never renders nothing.
 *
 * Admin only: staff read just their own ledger entries, so their view is
 * legitimately partial and every sale a colleague also took money for would
 * look like a mismatch.
 */
export function LedgerIntegrityBanner({
  batches,
  theme,
  /**
   * How far back to check, in days. Wire this to the dashboard's range control
   * once `subscribeToRange` lands so the two always agree on the period.
   */
  days = 90,
}: {
  batches: SalesBatch[];
  theme: any;
  days?: number;
}) {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentEntry[]>([]);

  const { startKey, endKey, label } = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    return {
      startKey: localDayKey(start),
      endKey: localDayKey(end),
      label: days >= 365 ? 'the last year' : `the last ${days} days`,
    };
  }, [days]);

  useEffect(() => {
    if (!isAdmin) return;
    return subscribeToPaymentsInRange(startKey, endKey, setPayments);
  }, [isAdmin, startKey, endKey]);

  // Only sales whose payments could fall inside the window are checkable —
  // comparing a sale's cached total against a window that cannot contain all
  // its payments would manufacture false mismatches.
  const inWindow = useMemo(
    () => batches.filter((b) => localDayKey(new Date(b.createdAt)) >= startKey),
    [batches, startKey],
  );

  const mismatched = useMemo(() => {
    if (!isAdmin) return [];
    return attachPayments(inWindow, payments, { trustMismatch: true }).filter((b) => b.hasMismatch);
  }, [isAdmin, inWindow, payments]);

  if (!isAdmin) return null;

  // Agreement is stated, not implied by silence — the whole point of scoping
  // honestly is that the reader knows what was and was not checked.
  if (mismatched.length === 0) {
    return (
      <View style={[styles.banner, styles.quiet, { borderColor: theme.outlineVariant }]}>
        <ThemedText type="small" themeColor="onSurfaceVariant">
          No discrepancies in {label} — every sale&apos;s paid total matches its
          payments. Older records are not checked here; use Daily Cash to review
          a specific date.
        </ThemedText>
      </View>
    );
  }

  const worst = mismatched.reduce((a, b) =>
    Math.abs(b.mismatchDelta) > Math.abs(a.mismatchDelta) ? b : a,
  );

  return (
    <Pressable onPress={() => router.push(`/transaction/${worst.id}` as never)}>
      <View style={[styles.banner, { backgroundColor: STATUS_META.Partial.bg }]}>
        <ThemedText type="smallBold" style={{ color: STATUS_META.Partial.color }}>
          {mismatched.length === 1
            ? "One sale's paid total doesn't match its payments"
            : `${mismatched.length} sales have paid totals that don't match their payments`}
        </ThemedText>
        <ThemedText type="small" style={{ color: STATUS_META.Partial.color, lineHeight: 18 }}>
          Checked {label}. The payment list is the real record. The largest gap
          is {formatCurrency(Math.abs(worst.mismatchDelta))} on {worst.clientName}.
          Open the sale and use Recalculate to reset the total from its payments.
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: Spacing.four,
    borderRadius: 16,
    gap: Spacing.one,
    marginHorizontal: Spacing.four,
  },
  quiet: { borderWidth: StyleSheet.hairlineWidth, backgroundColor: 'transparent' },
});
