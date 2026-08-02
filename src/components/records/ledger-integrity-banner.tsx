import type { PaymentEntry, SalesBatch } from '@/components/records/types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { attachPayments } from '@/services/payment-reconciliation';
import { subscribeToPayments } from '@/services/payment-repository';
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
 * This banner is the compensating control. It renders NOTHING when the books
 * agree, so it costs no attention until it matters — and it sits on the
 * dashboard rather than only on the cash page, because a check you have to
 * remember to open is a check that does not run.
 *
 * Admin only: staff read just their own ledger entries, so their view is
 * legitimately partial and every sale a colleague also took money for would
 * look like a mismatch.
 */
export function LedgerIntegrityBanner({ batches, theme }: { batches: SalesBatch[]; theme: any }) {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentEntry[]>([]);

  useEffect(() => {
    if (!isAdmin) return;
    return subscribeToPayments(setPayments);
  }, [isAdmin]);

  const mismatched = useMemo(() => {
    if (!isAdmin || payments.length === 0) return [];
    return attachPayments(batches, payments, { trustMismatch: true }).filter((b) => b.hasMismatch);
  }, [isAdmin, batches, payments]);

  if (mismatched.length === 0) return null;

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
          The payment list is the real record. The largest gap is{' '}
          {formatCurrency(Math.abs(worst.mismatchDelta))} on {worst.clientName}. Open the sale
          and use Recalculate to reset the total from its payments.
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
});
