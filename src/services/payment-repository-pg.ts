/**
 * Payment repository — Postgres-backed. db.ts port, slice 5.
 *
 * NOT YET WIRED to any screen. Tested directly against the real RPC (see
 * the design note this was built from), not through the UI. Blocked from
 * going live by a real dependency, not a scope choice: record_payment's
 * p_sale_id is a foreign key into Postgres `sales`, and no sale that exists
 * today has a Postgres row — reads haven't cut over. This becomes the live
 * implementation of `recordPayment`/`reversePayment` in
 * `payment-repository.ts` at cutover, once every sale it could be called
 * against actually exists on this side.
 */

import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/auth';
import type { OutboxOp, RecordPaymentPayload } from '@/services/outbox';
import { sendOp } from '@/services/outbox-send';
import { journalled, type JournalEntry } from '@/services/pending-journal';
import { pgPath } from '@/services/existence-check-pg';
import { roundNaira } from '@/utils/money';
import { localDayKey } from '@/utils/date';
import type { PaymentActor } from '@/services/payment-repository';
import type { PaymentEntry } from '@/components/records/types';

export type { PaymentActor };

/* ------------------------------------------------------------------ *
 * Pure core — no I/O, so the risky parts are testable.
 * ------------------------------------------------------------------ */

export interface BuildRecordPaymentOpInput {
  paymentBatchId: string;
  saleId: string;
  amount: number;
  method: RecordPaymentPayload['method'];
  reversalOf?: string;
  reversalReason?: string;
  notes?: string;
}

/**
 * Build the op for one payment. Same validation as the amount/reversal
 * rules `buildPaymentWrite` (Firebase version) enforced — the rules
 * themselves didn't change, only what carries them to the server.
 */
export function buildRecordPaymentOp(input: BuildRecordPaymentOpInput): OutboxOp {
  if (input.reversalOf && !input.reversalReason?.trim()) {
    throw new Error('A reversal must state a reason.');
  }
  if (!input.reversalOf && input.amount <= 0) {
    throw new Error('A payment must be greater than zero.');
  }

  return {
    kind: 'record_payment',
    payload: {
      payment_batch_id: input.paymentBatchId,
      sale_id: input.saleId,
      amount: roundNaira(input.amount),
      method: input.method,
      reversal_of: input.reversalOf,
      reversal_reason: input.reversalReason?.trim(),
      notes: input.notes?.trim() || undefined,
    },
  };
}

/**
 * The journal entry for a payment op: the client-generated key that proves
 * it landed, and enough for the operator to re-enter it by hand.
 *
 * `receiptId` matters here specifically: if this entry is ever surfaced as
 * `missing` and needs manual re-entry, the operator has to know WHICH sale
 * to re-enter it against. `saleId` alone is a UUID, useless to act on —
 * receiptNumber (e.g. "INV-260830-4F2A") is what they'd actually recognise.
 * Callers must pass it; there is no Firebase node to read it back from
 * anymore.
 */
export function journalEntryForPayment(
  op: Extract<OutboxOp, { kind: 'record_payment' }>,
  actor: PaymentActor,
  receiptNumber: string,
  now: Date = new Date(),
): JournalEntry {
  return {
    key: op.payload.payment_batch_id,
    // Namespaced so a single ExistenceCheck function can tell this apart
    // from a Firebase path — see existence-check-pg.ts.
    path: pgPath('payment_batches', op.payload.payment_batch_id),
    kind: op.payload.reversal_of ? 'reversal' : 'payment',
    amount: op.payload.amount,
    method: op.payload.method,
    receiptId: receiptNumber,
    byUid: actor.uid,
    byName: actor.name,
    at: now.toISOString(),
    atMs: now.getTime(),
    op,
  };
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

export interface RecordPaymentInput {
  saleId: string;
  /** For the journal only — see journalEntryForPayment. Not sent to the RPC. */
  receiptNumber: string;
  amount: number;
  method: RecordPaymentPayload['method'];
  notes?: string;
  actor: PaymentActor;
}

/**
 * Record a payment against a sale that already exists in Postgres.
 *
 * The payment_batch_id is generated here, client-side, via expo-crypto
 * (not the global `crypto.randomUUID()` — its availability across this
 * app's supported RN/Hermes versions isn't something to assume silently
 * for a value this load-bearing; expo-crypto is Expo's own maintained
 * wrapper). Generated BEFORE the write is issued, same reasoning as every
 * other client-generated key in this app: the journal has to know the key
 * before the write, or a crash between the two leaves nothing to recover.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<string> {
  const paymentBatchId = Crypto.randomUUID();
  const op = buildRecordPaymentOp({
    paymentBatchId,
    saleId: input.saleId,
    amount: input.amount,
    method: input.method,
    notes: input.notes,
  }) as Extract<OutboxOp, { kind: 'record_payment' }>;

  const entry = journalEntryForPayment(op, input.actor, input.receiptNumber);

  await journalled(entry, () => sendOp(op));
  return paymentBatchId;
}

export interface ReversePaymentInput {
  originalPaymentBatchId: string;
  saleId: string;
  /** For the journal only — see journalEntryForPayment. Not sent to the RPC. */
  receiptNumber: string;
  amount: number;
  method: RecordPaymentPayload['method'];
  reason: string;
  actor: PaymentActor;
}

/** Reverse a payment. Admin-only, enforced by RLS on payment_batches/payment_allocations. */
export async function reversePayment(input: ReversePaymentInput): Promise<string> {
  const paymentBatchId = Crypto.randomUUID();
  const op = buildRecordPaymentOp({
    paymentBatchId,
    saleId: input.saleId,
    amount: -Math.abs(input.amount),
    method: input.method,
    reversalOf: input.originalPaymentBatchId,
    reversalReason: input.reason,
  }) as Extract<OutboxOp, { kind: 'record_payment' }>;

  const entry = journalEntryForPayment(op, input.actor, input.receiptNumber);

  await journalled(entry, () => sendOp(op));
  return paymentBatchId;
}

/* ------------------------------------------------------------------ *
 * Reads — one-shot, not realtime (out of scope for this port).
 * ------------------------------------------------------------------ */

export interface PaymentAllocationRow {
  id: string;
  paymentBatchId: string;
  saleId: string;
  /** `sales.receipt_number` for the sale this allocation is against — what an operator recognises, unlike `saleId`. */
  receiptId: string;
  amount: number;
  kind: string;
  method: RecordPaymentPayload['method'];
  collectedBy: string;
  collectedByName: string;
  receivedAt: string;
  reversalOf: string | null;
  reversalReason: string | null;
}

/** Every payment allocation for one sale, newest first. */
export async function fetchPaymentsForSale(saleId: string): Promise<PaymentAllocationRow[]> {
  const { data, error } = await supabase
    .from('payment_allocations')
    .select(
      'id, payment_batch_id, sale_id, amount, kind, sales(receipt_number), payment_batches(method, collected_by, collected_by_name, received_at, reversal_of, reversal_reason)',
    )
    .eq('sale_id', saleId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    paymentBatchId: row.payment_batch_id,
    saleId: row.sale_id,
    receiptId: row.sales?.receipt_number,
    amount: roundNaira(row.amount),
    kind: row.kind,
    method: row.payment_batches?.method,
    collectedBy: row.payment_batches?.collected_by,
    collectedByName: row.payment_batches?.collected_by_name,
    receivedAt: row.payment_batches?.received_at,
    reversalOf: row.payment_batches?.reversal_of ?? null,
    reversalReason: row.payment_batches?.reversal_reason ?? null,
  }));
}

/**
 * `[start, end)` for one local calendar day, expressed as `Date`s built via
 * the local-time constructor — same assumption `localDayKey`/`parseDate`
 * (`@/utils/date`) already make (this app runs in Africa/Lagos; the local
 * `Date` constructor handles the UTC offset correctly as long as that's
 * true of the device it runs on, without hardcoding the offset here).
 */
function localDayBounds(dayKey: string): { start: string; end: string } {
  const [year, month, day] = dayKey.split('-').map(Number);
  const start = new Date(year, month - 1, day, 0, 0, 0, 0);
  const end = new Date(year, month - 1, day + 1, 0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function flattenPaymentBatches(rows: any[]): PaymentAllocationRow[] {
  const flat: PaymentAllocationRow[] = [];
  for (const batch of rows) {
    for (const alloc of batch.payment_allocations ?? []) {
      flat.push({
        id: alloc.id,
        paymentBatchId: batch.id,
        saleId: alloc.sale_id,
        receiptId: alloc.sales?.receipt_number,
        amount: roundNaira(alloc.amount),
        kind: alloc.kind,
        method: batch.method,
        collectedBy: batch.collected_by,
        collectedByName: batch.collected_by_name,
        receivedAt: batch.received_at,
        reversalOf: batch.reversal_of ?? null,
        reversalReason: batch.reversal_reason ?? null,
      });
    }
  }
  return flat;
}

const PAYMENT_BATCH_WITH_ALLOCATIONS_SELECT =
  'id, method, collected_by, collected_by_name, received_at, reversal_of, reversal_reason, payment_allocations(id, sale_id, amount, kind, sales(receipt_number))';

/**
 * One local calendar day's payments, newest first — replaces
 * `subscribeToPaymentsForDay`. What the reconciliation view (`cash.tsx`)
 * needs. Realtime is out of scope for this port; caller refreshes the same
 * way activity/expenses now do.
 *
 * Queries `payment_batches`, not `payment_allocations` (unlike
 * `fetchPaymentsForSale`) — `received_at` lives on the batch, and
 * PostgREST can only filter the table a query is rooted at, not an
 * embedded one.
 */
export async function fetchPaymentsForDay(dayKey: string): Promise<PaymentAllocationRow[]> {
  const { start, end } = localDayBounds(dayKey);
  const { data, error } = await supabase
    .from('payment_batches')
    .select(PAYMENT_BATCH_WITH_ALLOCATIONS_SELECT)
    .gte('received_at', start)
    .lt('received_at', end)
    .order('received_at', { ascending: false });

  if (error) throw error;
  return flattenPaymentBatches(data ?? []);
}

/**
 * Adapts a Postgres `PaymentAllocationRow` to the `PaymentEntry` shape the
 * UI already knows (`payment-reconciliation.ts`, `PaymentHistory`, the cash
 * reconciliation view). Shared by every screen that displays payment rows
 * from this repository (`transaction/[id].tsx`, `cash.tsx`,
 * `ledger-integrity-banner.tsx`) so the mapping can't drift between them.
 *
 * `batchPath` is set to `row.saleId` deliberately — `attachPayments`
 * (`payment-reconciliation.ts`) joins a payment to its batch via
 * `payment.batchPath === batch.dbPath`, and `sales-repository-pg.ts`'s
 * `normalizeSale` shims `SalesBatch.dbPath` to `sale.id`. This has to keep
 * matching that shim exactly for the join to keep working.
 *
 * `unreadablePayments` has no equivalent here: RLS on `payment_allocations`
 * simply omits a row the caller can't read rather than returning a
 * per-row denial the way ref-by-ref Firebase reads could report one — so
 * there is nothing for a caller to count.
 */
export function toPaymentEntry(row: PaymentAllocationRow): PaymentEntry {
  return {
    id: row.id,
    dbPath: pgPath('payment_batches', row.paymentBatchId),
    dayKey: localDayKey(row.receivedAt),
    amount: row.amount,
    method: row.method,
    at: row.receivedAt,
    atMs: new Date(row.receivedAt).getTime(),
    byUid: row.collectedBy,
    byName: row.collectedByName,
    receiptId: row.receiptId,
    batchPath: row.saleId,
    reversalOf: row.reversalOf ?? undefined,
    reversalReason: row.reversalReason ?? undefined,
    isReversal: Boolean(row.reversalOf),
  };
}

/**
 * A window of local calendar days, inclusive — replaces
 * `subscribeToPaymentsInRange`. Scoping an integrity check necessarily
 * weakens it (a discrepancy outside the window isn't seen — inherent to
 * scoping, not a flaw in it, same note the Firebase version carried:
 * anything built on this must SAY what period it covers).
 */
export async function fetchPaymentsInRange(startDayKey: string, endDayKey: string): Promise<PaymentAllocationRow[]> {
  const { start } = localDayBounds(startDayKey);
  const { end } = localDayBounds(endDayKey);
  const { data, error } = await supabase
    .from('payment_batches')
    .select(PAYMENT_BATCH_WITH_ALLOCATIONS_SELECT)
    .gte('received_at', start)
    .lt('received_at', end)
    .order('received_at', { ascending: false });

  if (error) throw error;
  return flattenPaymentBatches(data ?? []);
}
