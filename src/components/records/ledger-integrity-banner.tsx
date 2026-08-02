import type { PaymentEntry, SalesBatch } from '@/components/records/types';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { attachPayments, type BatchWithPayments } from '@/services/payment-reconciliation';
import { subscribeToPaymentsInRange } from '@/services/payment-repository';
import { formatCurrency } from '@/utils/currency';
import { localDayKey } from '@/utils/date';
import { STATUS_META } from '@/utils/payment-status';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

/**
 * Does the cached `totalPaid` on each sale agree with the payment ledger?
 *
 * WHY THIS EXISTS — the accepted risk it compensates for:
 *
 * `totalPaid` must stay writable by staff, because `ServerValue.increment`
 * writes to that exact path and the rules cannot tell an increment apart from
 * an arbitrary assignment. The application never writes it any other way, but
 * the RULES do not enforce that, and Stage 2's premise is that every naira in
 * `totalPaid` traces to a ledger entry. See AUDIT_2026-07.md.
 *
 * THREE STATES, NOT TWO. `unknown` is a real state and must render nothing:
 * before the subscriptions have delivered, there is no evidence either way, and
 * an empty array is indistinguishable from "loaded, and there is nothing".
 * Printing a clean verdict against data that has not arrived is a verdict this
 * has not earned — and a false all-clear is worse than no answer.
 *
 * IT IS SCOPED, AND IT SAYS SO. A gap one day outside the window would
 * otherwise produce silence, which is the failure this was built to prevent,
 * only quieter. So the clean state is *stated*, with its period, never implied.
 */
export type IntegrityStatus = 'unknown' | 'clean' | 'discrepancy';

export interface LedgerIntegrity {
  status: IntegrityStatus;
  mismatched: BatchWithPayments[];
  /** The largest gap, when there is one. */
  worst: BatchWithPayments | null;
  /** Human-readable period, e.g. "the last 90 days". */
  label: string;
}

/**
 * Pure state derivation, separated so the three-way decision is testable
 * without rendering or subscriptions.
 */
export function deriveIntegrityStatus(input: {
  isAdmin: boolean;
  batchesReceived: boolean;
  paymentsReceived: boolean;
  mismatchedCount: number;
}): IntegrityStatus {
  // Non-admins see a partial ledger by design, so they can never be told
  // anything trustworthy here — treat it as unknown rather than clean.
  if (!input.isAdmin) return 'unknown';
  if (!input.batchesReceived || !input.paymentsReceived) return 'unknown';
  return input.mismatchedCount > 0 ? 'discrepancy' : 'clean';
}

export function useLedgerIntegrity({
  batches,
  batchesReceived,
  days = 90,
}: {
  batches: SalesBatch[];
  /** True once the sales subscription has delivered a snapshot. */
  batchesReceived: boolean;
  days?: number;
}): LedgerIntegrity {
  const { isAdmin } = useAuth();
  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  // Which window delivered, rather than a boolean. An empty ledger is a valid
  // loaded state so emptiness cannot stand in for "has arrived" — and keying it
  // to the window means changing the window invalidates it automatically,
  // without a synchronous reset inside the effect.
  const [receivedFor, setReceivedFor] = useState<string | null>(null);

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
    return subscribeToPaymentsInRange(startKey, endKey, (received) => {
      setPayments(received);
      setReceivedFor(`${startKey}..${endKey}`);
    });
  }, [isAdmin, startKey, endKey]);

  const paymentsReceived = receivedFor === `${startKey}..${endKey}`;

  // Only sales whose payments could fall inside the window are comparable —
  // checking an older sale against a window that cannot contain all of its
  // payments would manufacture a mismatch that is not real.
  const inWindow = useMemo(
    () => batches.filter((b) => localDayKey(new Date(b.createdAt)) >= startKey),
    [batches, startKey],
  );

  const mismatched = useMemo(
    () => attachPayments(inWindow, payments, { trustMismatch: true }).filter((b) => b.hasMismatch),
    [inWindow, payments],
  );

  const status = deriveIntegrityStatus({
    isAdmin,
    batchesReceived,
    paymentsReceived,
    mismatchedCount: mismatched.length,
  });

  const worst =
    mismatched.length > 0
      ? mismatched.reduce((a, b) => (Math.abs(b.mismatchDelta) > Math.abs(a.mismatchDelta) ? b : a))
      : null;

  return { status, mismatched, worst, label };
}

/**
 * TOP OF THE SCREEN — only when something is actually wrong.
 *
 * Fades in if it appears after load; never slides, never reserves height while
 * unknown. A banner that pushes the dashboard down to say nothing is wrong has
 * taken the most valuable space on a phone to deliver no information.
 */
export function LedgerIntegrityBanner({
  integrity,
  theme,
  reduceMotion = false,
}: {
  integrity: LedgerIntegrity;
  theme: any;
  reduceMotion?: boolean;
}) {
  const router = useRouter();
  const { status, mismatched, worst, label } = integrity;
  // useState initialiser, not useRef().current — reading a ref during render
  // is what the react-hooks/refs rule forbids.
  const [opacity] = useState(() => new Animated.Value(reduceMotion ? 1 : 0));

  useEffect(() => {
    if (status !== 'discrepancy') return;
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [status, reduceMotion, opacity]);

  if (status !== 'discrepancy' || !worst) return null;

  return (
    <Animated.View style={{ opacity }}>
      <Pressable
        onPress={() => router.push(`/transaction/${worst.id}` as never)}
        accessibilityRole="button"
        accessibilityLabel={`${mismatched.length} sales have paid totals that do not match their payments`}
      >
        <View style={[styles.banner, { backgroundColor: STATUS_META.Partial.bg }]}>
          <ThemedText type="smallBold" style={{ color: STATUS_META.Partial.color }}>
            {mismatched.length === 1
              ? "One sale's paid total doesn't match its payments"
              : `${mismatched.length} sales have paid totals that don't match their payments`}
          </ThemedText>
          <ThemedText type="small" style={{ color: STATUS_META.Partial.color, lineHeight: 18 }}>
            Checked {label}. The payment list is the real record. The largest gap is{' '}
            {formatCurrency(Math.abs(worst.mismatchDelta))} on {worst.clientName}. Open the
            sale and use Recalculate to reset the total from its payments.
          </ThemedText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/**
 * BOTTOM OF THE SCREEN — the clean confirmation.
 *
 * Same wording and the same scope caveat as the banner's, because the point is
 * that agreement is *stated* rather than inferred from silence. It just does
 * not need the top of the screen to say it. Not animated: it is the resting
 * state, and fading it in would draw the eye to the least urgent thing here.
 */
export function LedgerIntegrityNote({
  integrity,
  theme,
}: {
  integrity: LedgerIntegrity;
  theme: any;
}) {
  if (integrity.status !== 'clean') return null;

  return (
    <View style={[styles.note, { borderTopColor: theme.outlineVariant }]}>
      <ThemedText type="small" themeColor="onSurfaceVariant" style={styles.noteText}>
        No discrepancies in {integrity.label} — every sale&apos;s paid total matches its
        payments. Older records are not checked here; use Daily Cash to review a specific
        date.
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: Spacing.four,
    borderRadius: 16,
    gap: Spacing.one,
    marginHorizontal: Spacing.four,
  },
  note: {
    marginTop: Spacing.five,
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  noteText: { lineHeight: 18 },
});
