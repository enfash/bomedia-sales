/**
 * Joining the payment ledger to sales, and reconciling the two.
 *
 * Pure. No I/O, no Firebase, no React — every rule about which number to trust
 * lives here so it can be tested directly.
 *
 * WHY THIS IS NOT IN `normalizeBatch`: payments live at their own root, so the
 * normalizer only ever sees one batch node and cannot see the entries. The join
 * happens here instead, which keeps `normalizeBatch` a pure function of a
 * single node and puts the "ledger wins" rule in one obvious place.
 */

import type { PaymentEntry, PaymentMethod, SalesBatch } from '@/components/records/types';
import { localDayKey } from '@/utils/date';
import { roundNaira } from '@/utils/money';

/** A sale with its ledger attached and the two totals compared. */
export interface BatchWithPayments extends SalesBatch {
  payments: PaymentEntry[];
  /** Sum of the ledger entries, reversals included. The authoritative figure. */
  paymentsTotal: number;
  /**
   * True when the cached `totalPaid` disagrees with the ledger. The UI must
   * say so in words rather than showing a number the reader has to interpret.
   */
  hasMismatch: boolean;
  /** `paymentsTotal - totalPaid`. Signed, so the direction of drift is visible. */
  mismatchDelta: number;
}

/**
 * Attach each batch's payments and flag disagreements.
 *
 * The ledger is authoritative. `totalPaid` is a cache maintained by an atomic
 * increment; it can only drift if a write half-landed, which the atomic update
 * is designed to prevent — but "designed to prevent" is not "cannot happen",
 * and money that silently disagrees with itself is the failure this whole
 * stage exists to remove.
 *
 * NOTE the `payments` list may be PARTIAL: a staff member can only read their
 * own entries, so a mismatch they see may simply be everyone else's payments.
 * Pass `trustMismatch: false` for non-admins so the UI does not cry wolf.
 */
export function attachPayments(
  batches: SalesBatch[],
  payments: PaymentEntry[],
  options: { trustMismatch?: boolean } = {},
): BatchWithPayments[] {
  const trustMismatch = options.trustMismatch ?? true;

  const byBatch = new Map<string, PaymentEntry[]>();
  for (const p of payments) {
    const list = byBatch.get(p.batchPath);
    if (list) list.push(p);
    else byBatch.set(p.batchPath, [p]);
  }

  return batches.map((batch) => {
    const mine = (byBatch.get(batch.dbPath) ?? []).slice().sort((a, b) => b.atMs - a.atMs);
    const paymentsTotal = roundNaira(mine.reduce((sum, p) => sum + p.amount, 0));
    const mismatchDelta = paymentsTotal - roundNaira(batch.totalPaid);

    return {
      ...batch,
      payments: mine,
      paymentsTotal,
      hasMismatch: trustMismatch && mismatchDelta !== 0,
      mismatchDelta,
    };
  });
}

/**
 * The mismatch explained in words.
 *
 * Deliberately a sentence, not a red number: the person reading this is at a
 * counter with a customer waiting, and "₦-5,000" in red tells them nothing
 * about what to do.
 */
export function describeMismatch(batch: BatchWithPayments, format: (n: number) => string): string {
  const { paymentsTotal, totalPaid } = batch;
  return (
    `This sale's totals don't agree. The payments listed add up to ` +
    `${format(paymentsTotal)}, but the sale's paid figure says ${format(totalPaid)}. ` +
    `The payment list is the real record — the paid figure is a cached total ` +
    `that has drifted. Recalculate resets it from the payments. Nothing is lost either way.`
  );
}

/* ------------------------------------------------------------------ *
 * Daily cash reconciliation
 * ------------------------------------------------------------------ */

export interface MethodTotal {
  method: PaymentMethod;
  collected: number;
  reversed: number;
  net: number;
  count: number;
}

export interface StaffTotal {
  uid: string;
  name: string;
  collected: number;
  reversed: number;
  net: number;
  count: number;
}

export interface DailyCash {
  dayKey: string;
  /** Positive entries only — what came in. */
  collected: number;
  /** Reversals as a POSITIVE figure — what went back out. */
  reversed: number;
  /** collected - reversed. What the drawer and the bank should show. */
  net: number;
  byMethod: MethodTotal[];
  byStaff: StaffTotal[];
  entries: PaymentEntry[];
  /** What should physically be in the drawer: net cash only. */
  expectedCashInHand: number;
}

const METHODS: PaymentMethod[] = ['Cash', 'POS', 'Transfer'];

/**
 * Roll one day's ledger into the figures needed to count a drawer.
 *
 * Collected and reversed are reported SEPARATELY rather than netted into one
 * number. A day with ₦50,000 in and ₦50,000 reversed is not the same as a
 * quiet day, and a single "₦0" would hide that entirely.
 */
export function summariseDay(dayKey: string, payments: PaymentEntry[]): DailyCash {
  const entries = payments
    .filter((p) => p.dayKey === dayKey)
    .slice()
    .sort((a, b) => b.atMs - a.atMs);

  const split = (list: PaymentEntry[]) => {
    let collected = 0;
    let reversed = 0;
    for (const p of list) {
      if (p.amount >= 0) collected += p.amount;
      else reversed += -p.amount;
    }
    return { collected: roundNaira(collected), reversed: roundNaira(reversed) };
  };

  const overall = split(entries);

  const byMethod: MethodTotal[] = METHODS.map((method) => {
    const list = entries.filter((p) => p.method === method);
    const { collected, reversed } = split(list);
    return { method, collected, reversed, net: collected - reversed, count: list.length };
  }).filter((m) => m.count > 0);

  const staffIds = [...new Set(entries.map((p) => p.byUid))];
  const byStaff: StaffTotal[] = staffIds
    .map((uid) => {
      const list = entries.filter((p) => p.byUid === uid);
      const { collected, reversed } = split(list);
      return {
        uid,
        name: list[0]?.byName ?? 'Unknown',
        collected,
        reversed,
        net: collected - reversed,
        count: list.length,
      };
    })
    .sort((a, b) => b.net - a.net);

  const cash = byMethod.find((m) => m.method === 'Cash');

  return {
    dayKey,
    collected: overall.collected,
    reversed: overall.reversed,
    net: overall.collected - overall.reversed,
    byMethod,
    byStaff,
    entries,
    // Only cash is physically countable. POS and Transfer land in the bank.
    expectedCashInHand: cash ? cash.net : 0,
  };
}

/** Today's bucket key, so callers do not re-derive the date rule. */
export function todayKey(now: Date = new Date()): string {
  return localDayKey(now);
}
