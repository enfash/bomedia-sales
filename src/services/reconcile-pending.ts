import { dbService } from '@/services/db';
import { replayMissing, type ReplayResult } from '@/services/outbox';
import { sendOp } from '@/services/outbox-send';
import { clear, list, reconcile, type ReconcileResult } from '@/services/pending-journal';

export interface ReconcileAndReplayResult extends ReconcileResult {
  replayed: ReplayResult[];
}

/**
 * Cold-start recovery: find out what the server is missing, then send it.
 *
 * CALL THIS ONCE, EARLY. Not because the check would otherwise read a cache —
 * `existsOnServer` goes over REST and cannot — but because a write that did not
 * land should be resent before the operator starts taking the next payment.
 *
 * Replay is confined to the `missing` bucket that reconciliation produced. It
 * is never given the caller's opinion of what is missing, and never the
 * `unverified` bucket: see the safety invariant in `outbox.ts`.
 */
export async function reconcilePendingWrites(): Promise<ReconcileAndReplayResult> {
  const result = await reconcile((path) => dbService.existsOnServer(path));

  if (result.missing.length === 0) return { ...result, replayed: [] };

  const replayed = await replayMissing(result.missing, new Set(result.missing.map((e) => e.key)), {
    send: sendOp,
    clear,
  });

  // Anything actually sent is no longer missing — re-read rather than trusting
  // the pre-replay snapshot, so the UI cannot show a resolved write as lost.
  const sent = new Set(replayed.filter((r) => r.outcome === 'sent').map((r) => r.key));
  const stillHere = await list();

  return {
    ...result,
    missing: stillHere.filter((e) => result.missing.some((m) => m.key === e.key) && !sent.has(e.key)),
    replayed,
  };
}
