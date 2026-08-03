import { dbService } from '@/services/db';
import { reconcile, type ReconcileResult } from '@/services/pending-journal';

/**
 * Cold-start reconciliation: check every write the app recorded but never saw
 * acked, and say which ones actually reached the server.
 *
 * CALL THIS ONCE, EARLY, BEFORE SUBSCRIPTIONS ATTACH. Not because the check
 * would otherwise read a cache — `existsOnServer` goes over REST and cannot —
 * but because the operator should learn a payment may be missing before they
 * start taking the next one.
 *
 * It never replays. `missing` entries are handed to the UI for the operator to
 * re-enter by hand, because only they can confirm what was actually collected,
 * and a manual re-entry produces a genuinely new key rather than risking a
 * double-write under the old one.
 */
export async function reconcilePendingWrites(): Promise<ReconcileResult> {
  return reconcile((path) => dbService.existsOnServer(path));
}
