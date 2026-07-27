import { dbService } from '@/services/db';

/**
 * In-app activity feed. Every meaningful mutation (sale created, payment
 * recorded, production moved, expense logged, sale deleted) appends an entry
 * under `activity/{pushId}`. The feed is admin-only to read (see the security
 * rules) and append-only to write, so staff actions surface to the owner
 * without staff being able to read or tamper with the log.
 */

export type ActivityType =
  | 'sale_created'
  | 'payment_recorded'
  | 'production_moved'
  | 'expense_logged'
  | 'sale_deleted'
  | 'sale_edited';

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  /** Human-readable summary, e.g. "Ada logged a ₦5,000 payment for Blessing". */
  message: string;
  actorUid: string;
  actorName: string;
  /** ISO timestamp. */
  at: string;
  /** Epoch ms — for ordering without re-parsing `at`. */
  atMs: number;
  /** Optional structured context (batchId, amount, etc.). */
  meta?: Record<string, unknown>;
}

export interface ActivityActor {
  uid: string;
  name: string;
}

/** Derive an activity actor from the authenticated Firebase user. */
export function actorFrom(user: { uid: string; displayName?: string | null; email?: string | null } | null | undefined): ActivityActor {
  return {
    uid: user?.uid ?? '',
    name: user?.displayName || user?.email || 'Someone',
  };
}

interface LogActivityInput {
  type: ActivityType;
  message: string;
  actor: ActivityActor;
  meta?: Record<string, unknown>;
}

/**
 * Append an activity entry. Fire-and-forget: logging must never break the
 * primary action, so failures are swallowed (and surfaced to the console only).
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const now = new Date();
    await dbService.pushRecord('activity', {
      type: input.type,
      message: input.message,
      actorUid: input.actor.uid || '',
      actorName: input.actor.name || 'Unknown',
      at: now.toISOString(),
      atMs: now.getTime(),
      ...(input.meta ? { meta: input.meta } : {}),
    });
  } catch (err) {
    console.warn('logActivity failed (non-fatal):', err);
  }
}

/**
 * Subscribe to the activity feed, newest-first. Returns an unsubscribe fn.
 * `limit` caps how many entries are kept client-side.
 */
export function subscribeToActivity(
  callback: (entries: ActivityEntry[]) => void,
  limit = 100,
): () => void {
  return dbService.subscribe<Record<string, Omit<ActivityEntry, 'id'>>>('activity', (data) => {
    if (!data || typeof data !== 'object') {
      callback([]);
      return;
    }
    const entries: ActivityEntry[] = Object.keys(data).map((id) => ({ ...data[id], id }));
    entries.sort((a, b) => (b.atMs || 0) - (a.atMs || 0));
    callback(entries.slice(0, limit));
  });
}
