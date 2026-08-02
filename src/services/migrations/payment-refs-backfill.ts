/**
 * Rebuild `sales/…/{saleId}/paymentRefs` from the payment ledger.
 *
 * PURE. No I/O — the runner is documented in DATABASE_RUNBOOK.md and needs the
 * Admin SDK re-added, exactly like the wipe script did.
 *
 * TWO REASONS THIS EXISTS, and the second is the one that will actually be used:
 *
 *  1. **Restores.** If a pre-incident export is ever restored, those sales come
 *     back with a nonzero `totalPaid` and no `paymentRefs` — and the
 *     transaction screen, which now reads payments *through* the refs, would
 *     show no payments at all against a sale that was clearly paid. Silent, and
 *     exactly the kind of wrong that gets noticed by a customer first.
 *
 *  2. **Repair.** A `paymentRefs` child can be deleted by an admin and the
 *     rules cannot stop it — see the note in AUDIT_2026-07.md. The refs are an
 *     index, not a record: the ledger under `payments/` is create-only and
 *     immutable, so the refs are always reconstructible from it. This is the
 *     reconstruction.
 *
 * Written now, while the mapping is fresh, rather than when it is needed.
 */

import type { StoredPayment } from '@/components/records/types';

export interface RefBackfillPlan {
  /** Multi-path update: `sales/…/paymentRefs/{key}` -> `"{dayKey}/{uid}"`. */
  updates: Record<string, string>;
  /** Entries whose `batchPath` points at a sale that no longer exists. */
  orphans: { key: string; batchPath: string; amount: number }[];
  /** Refs already present and correct — counted, never rewritten. */
  alreadyCorrect: number;
  /** Refs present but pointing somewhere else. Never overwritten; reported. */
  conflicts: { path: string; existing: string; expected: string }[];
  ledgerEntryCount: number;
  salesTouched: number;
}

const EMPTY: RefBackfillPlan = {
  updates: {},
  orphans: [],
  alreadyCorrect: 0,
  conflicts: [],
  ledgerEntryCount: 0,
  salesTouched: 0,
};

/** Does a node at `sales/…` exist in the tree at this slash-separated path? */
function nodeAt(root: any, path: string): any {
  let cursor = root;
  for (const segment of path.split('/').slice(1)) {
    if (!cursor || typeof cursor !== 'object') return null;
    cursor = cursor[segment];
  }
  return cursor ?? null;
}

/**
 * Walk the ledger and work out which refs are missing.
 *
 * @param paymentsRoot the `payments` node: `{ [dayKey]: { [uid]: { [key]: entry } } }`
 * @param salesRoot    the `sales` node, used to confirm each target exists
 */
export function planPaymentRefBackfill(paymentsRoot: any, salesRoot: any): RefBackfillPlan {
  if (!paymentsRoot || typeof paymentsRoot !== 'object') return { ...EMPTY };

  const plan: RefBackfillPlan = {
    updates: {},
    orphans: [],
    alreadyCorrect: 0,
    conflicts: [],
    ledgerEntryCount: 0,
    salesTouched: 0,
  };
  const touched = new Set<string>();

  for (const [dayKey, byUid] of Object.entries(paymentsRoot)) {
    if (!byUid || typeof byUid !== 'object') continue;

    for (const [uid, entries] of Object.entries(byUid as Record<string, any>)) {
      if (!entries || typeof entries !== 'object') continue;

      for (const [key, raw] of Object.entries(entries as Record<string, StoredPayment>)) {
        const entry = raw as StoredPayment;
        if (!entry || typeof entry !== 'object' || entry.amount === undefined) continue;
        plan.ledgerEntryCount++;

        const batchPath = entry.batchPath;
        if (!batchPath) continue;

        // A ref pointing at a sale that is gone would be a dangling index.
        // Report it rather than writing it — the entry is still the record of
        // money taken, and that discrepancy deserves a human.
        const sale = nodeAt(salesRoot, batchPath);
        if (!sale) {
          plan.orphans.push({ key, batchPath, amount: entry.amount ?? 0 });
          continue;
        }

        const expected = `${dayKey}/${uid}`;
        const existing = sale.paymentRefs?.[key];

        if (existing === expected) {
          plan.alreadyCorrect++;
          continue;
        }
        if (existing !== undefined && existing !== expected) {
          // Refs are create-only by rule. A different value means something
          // wrote it by hand; overwriting would destroy that evidence.
          plan.conflicts.push({
            path: `${batchPath}/paymentRefs/${key}`,
            existing: String(existing),
            expected,
          });
          continue;
        }

        plan.updates[`${batchPath}/paymentRefs/${key}`] = expected;
        touched.add(batchPath);
      }
    }
  }

  plan.salesTouched = touched.size;
  return plan;
}

/**
 * True when the ledger and the refs already agree — the expected result of a
 * second run, and what makes this safe to re-run.
 */
export function isBackfillComplete(plan: RefBackfillPlan): boolean {
  return Object.keys(plan.updates).length === 0 && plan.conflicts.length === 0;
}
