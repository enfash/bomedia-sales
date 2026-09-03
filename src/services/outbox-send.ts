import { dbService } from '@/services/db';
import { supabase } from '@/lib/auth';
import type { IncrementMarker, OutboxOp } from '@/services/outbox';
import type { Json } from '@/types/supabase';

/**
 * The parts of the outbox that touch a backend, kept apart from the replay
 * logic so that logic — and everything importing it for the age cap — can be
 * tested without pulling in either SDK.
 *
 * Handles both op families (see the union on `OutboxOp` for why): Firebase
 * ('update'/'set', still what sales-repository.ts/payment-repository.ts
 * construct) and the new Postgres RPCs ('create_sale'/'record_payment',
 * constructed by the not-yet-wired -pg repositories). Collapses to the
 * Postgres-only half once the cutover lands.
 */

function isIncrement(value: unknown): value is IncrementMarker {
  return Boolean(value) && typeof value === 'object' && typeof (value as any).__increment === 'number';
}

/** Rebuild SDK sentinels from their stored markers. */
export function materialise<T extends Record<string, unknown>>(updates: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(updates)) {
    out[path] = isIncrement(value) ? dbService.increment(value.__increment) : value;
  }
  return out;
}

/** Sends one op for real. Injected into `replayMissing` as its `send`. */
export async function sendOp(op: OutboxOp): Promise<void> {
  if (op.kind === 'set') {
    await dbService.setRecord(op.path, op.value);
    return;
  }
  if (op.kind === 'update') {
    await dbService.updateAtomic(materialise(op.updates));
    return;
  }

  if (op.kind === 'create_sale') {
    const { error } = await supabase.rpc('create_sale', {
      p_receipt_number: op.payload.receipt_number,
      p_client_id: op.payload.client_id,
      // Structured request payloads, not app-level data read back and
      // re-typed — casting to Json at this one call boundary is what a
      // generic jsonb RPC arg costs; see the same pattern in activity.ts.
      p_lines: op.payload.lines as unknown as Json,
      p_adjustments: (op.payload.adjustments ?? []) as unknown as Json,
      p_notes: op.payload.notes ?? undefined,
      p_due_date: op.payload.due_date ?? undefined,
      p_opening_payment: (op.payload.opening_payment ?? undefined) as unknown as Json | undefined,
    });
    if (error) throw error;
    return;
  }

  const { error } = await supabase.rpc('record_payment', {
    p_payment_batch_id: op.payload.payment_batch_id,
    p_sale_id: op.payload.sale_id,
    p_amount: op.payload.amount,
    p_method: op.payload.method,
    p_reversal_of: op.payload.reversal_of ?? undefined,
    p_reversal_reason: op.payload.reversal_reason ?? undefined,
    p_notes: op.payload.notes ?? undefined,
  });
  if (error) throw error;
}
