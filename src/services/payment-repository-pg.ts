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
import type { PaymentActor } from '@/services/payment-repository';

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
      'id, payment_batch_id, sale_id, amount, kind, payment_batches(method, collected_by, collected_by_name, received_at, reversal_of, reversal_reason)',
    )
    .eq('sale_id', saleId)
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    id: row.id,
    paymentBatchId: row.payment_batch_id,
    saleId: row.sale_id,
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
