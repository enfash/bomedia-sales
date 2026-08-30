import type { JournalEntry } from '@/services/pending-journal';

/**
 * Replay for writes that provably did not reach the server.
 *
 * This is the pending journal plus a payload — not a second queue. The journal
 * already records, before every money write, the key that write would land
 * under and the node whose existence proves it did. The outbox adds the write
 * itself, so an entry the server does not have can be sent again instead of
 * only being reported.
 *
 * THE DUPLICATE-SAFETY PROPERTY, which everything here exists to preserve:
 *
 *   Replay happens ONLY on the verdict `missing`.
 *
 * `missing` is the one verdict that means the server was asked and answered
 * that it does not have the write. `unverified` means the question could not be
 * asked — captive portal, expired token, dead uplink — and replaying on it
 * would post money the server may already hold. `landed` obviously needs
 * nothing. This is a safety invariant, NOT an optimisation: widening replay to
 * `unverified` to "catch more" converts this feature into a duplicate-payment
 * generator. See `outbox.test.ts`, which asserts it directly.
 */

/**
 * How old an entry may be and still be sent automatically.
 *
 * Past this, the shop has had time to notice and re-enter it on paper or by
 * hand, and a silent post days later is a duplicate nobody can trace back to a
 * cause. Older entries are surfaced for the operator to confirm instead.
 */
export const AUTO_REPLAY_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * `ServerValue.increment` is an opaque SDK sentinel and does not survive
 * JSON.stringify, so the stored payload carries this marker instead and the
 * real sentinel is rebuilt at write time. The same encoded object is what gets
 * persisted AND what the original write uses, so a replay cannot drift from the
 * write it repeats.
 *
 * STILL LIVE. `payment-repository.ts`'s standalone recordPayment/reversePayment
 * (payments against an already-existing sale) still write Firebase — see the
 * note on OutboxOp below for why removing this isn't safe yet.
 */
export interface IncrementMarker {
  __increment: number;
}

export function encodeIncrement(delta: number): IncrementMarker {
  return { __increment: delta };
}

/**
 * The write itself, in a form that survives storage.
 *
 * TEMPORARY UNION, not the clean break originally planned for this slice.
 * The RTDB-shaped variants ('update'/'set') are what `sales-repository.ts`
 * and `payment-repository.ts` still construct — both are staying on
 * Firebase for now, deliberately: `record_payment`'s `p_sale_id` is a real
 * foreign key into Postgres `sales`, and no existing sale has a Postgres row
 * yet (reads haven't cut over either). Wiring standalone payment recording
 * to Postgres now would fail every payment against every sale that exists
 * today. The Postgres-shaped variants ('create_sale'/'record_payment') are
 * what the new, not-yet-wired `sales-repository-pg.ts` /
 * `payment-repository-pg.ts` construct — tested directly, not through any
 * screen. Collapse this back to just the new variants once the cutover
 * moves every caller across at once (see supabase/README.md → "Cutover
 * plan").
 */
export type OutboxOp =
  | { kind: 'update'; updates: Record<string, unknown> }
  | { kind: 'set'; path: string; value: unknown }
  | { kind: 'create_sale'; payload: CreateSalePayload }
  | { kind: 'record_payment'; payload: RecordPaymentPayload };

export interface CreateSaleLine {
  material_type: string;
  width_ft: number;
  height_ft: number;
  job_unit: 'in' | 'ft';
  quantity: number;
  unit_price: number;
  total: number;
  eyelets?: boolean;
  lamination?: boolean;
  turnaround_time?: string;
  job_name?: string;
}

export interface CreateSaleAdjustment {
  kind: 'mov' | 'delivery' | 'legacy';
  label: string;
  amount: number;
}

export interface CreateSalePayload {
  receipt_number: string;
  client_id: string;
  lines: CreateSaleLine[];
  adjustments?: CreateSaleAdjustment[];
  notes?: string;
  due_date?: string;
  opening_payment?: {
    payment_batch_id: string;
    amount: number;
    method: 'Transfer' | 'POS' | 'Cash';
  };
}

export interface RecordPaymentPayload {
  payment_batch_id: string;
  sale_id: string;
  amount: number;
  method: 'Transfer' | 'POS' | 'Cash';
  reversal_of?: string;
  reversal_reason?: string;
}

export type ReplayOutcome = 'sent' | 'skipped-unverified' | 'skipped-landed' | 'skipped-too-old' | 'no-payload' | 'failed';

export interface ReplayResult {
  key: string;
  outcome: ReplayOutcome;
  error?: unknown;
}

export interface ReplayDeps {
  /** Sends one op. Injected so the replay logic is testable without Firebase. */
  send: (op: OutboxOp) => Promise<void>;
  /** Drops the journal entry once the server has it. */
  clear: (key: string) => Promise<void>;
  now?: number;
}

export function isAutoReplayable(entry: JournalEntry, now = Date.now()): boolean {
  return Boolean(entry.op) && now - entry.atMs <= AUTO_REPLAY_MAX_AGE_MS;
}

/**
 * Send the writes the server confirmed it does not have.
 *
 * SEQUENTIAL, IN ISSUE ORDER, STOPPING AT THE FIRST FAILURE. Money writes are
 * ordered — a payment against a sale that has not landed yet is a payment
 * against nothing — and a failure means the connection went away again, so the
 * ones behind it would fail too and burn their one clean attempt. Nothing is
 * ever replayed concurrently: two in-flight replays cannot be reasoned about
 * from the journal, which is a single-writer log.
 *
 * `missingKeys` must come from reconciliation, not from the caller's opinion.
 */
export async function replayMissing(
  entries: JournalEntry[],
  missingKeys: Set<string>,
  deps: ReplayDeps,
): Promise<ReplayResult[]> {
  const now = deps.now ?? Date.now();
  const results: ReplayResult[] = [];

  const ordered = [...entries].sort((a, b) => a.atMs - b.atMs);

  for (const entry of ordered) {
    // THE INVARIANT. Anything not confirmed absent is left alone, whatever it
    // costs in convenience.
    if (!missingKeys.has(entry.key)) {
      results.push({ key: entry.key, outcome: 'skipped-unverified' });
      continue;
    }
    if (!entry.op) {
      // Written before the outbox existed, or a write the outbox does not cover.
      results.push({ key: entry.key, outcome: 'no-payload' });
      continue;
    }
    if (now - entry.atMs > AUTO_REPLAY_MAX_AGE_MS) {
      results.push({ key: entry.key, outcome: 'skipped-too-old' });
      continue;
    }

    try {
      await deps.send(entry.op);
      await deps.clear(entry.key);
      results.push({ key: entry.key, outcome: 'sent' });
    } catch (error) {
      results.push({ key: entry.key, outcome: 'failed', error });
      // Stop: the connection has gone again, and the entries behind this one
      // would each fail in turn.
      break;
    }
  }

  return results;
}
