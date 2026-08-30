import { supabase } from '@/lib/auth';
import type { Json } from '@/types/supabase';

/**
 * In-app activity feed. Every meaningful mutation (sale created, payment
 * recorded, production moved, expense logged, sale deleted) appends an entry
 * to `activity`. The feed is admin-only to read (RLS) and append-only to
 * write, so staff actions surface to the owner without staff being able to
 * read or tamper with the log.
 *
 * Read side is a one-shot fetch, not a live subscription — realtime is out
 * of scope for this port (see supabase/README.md's port plan); screens that
 * show this feed refresh it via pull-to-refresh or on demand, not push.
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

/**
 * Derive an activity actor from the authenticated user and their profile.
 *
 * Prefer `useAuth().actor` — the context builds this once so no caller can
 * assemble a half-right actor. This stays exported for the context and tests.
 *
 * The chain is ordered and exhaustive, and it NEVER returns a blank name — a
 * nameless attribution is the same failure as a wrong one:
 *
 *   1. `profiles.name` — the app's own profile record, and the only name a
 *      person can be given from inside the app.
 *   2. Google's display name — **deliberately not the source of truth.** A
 *      name set only on the auth provider is invisible to every query. Do
 *      not "fix" naming by relying on it: set `profiles.name`.
 *   3. `email` — correct, if ugly. Old ledger entries carry these and are left
 *      alone; see the attribution section in docs/AUDIT_2026-07.md.
 *   4. `uid` — unreadable, but it identifies exactly one person and can be
 *      resolved later. Never reached in practice.
 */
export function actorFrom(
  user: { uid: string; displayName?: string | null; email?: string | null } | null | undefined,
  profileName?: string | null,
): ActivityActor {
  const uid = user?.uid ?? '';
  return {
    uid,
    name: profileName?.trim() || user?.displayName || user?.email || uid || 'Someone',
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
 *
 * Do NOT chain `.select()` onto this insert. Staff can only ever satisfy
 * `activity`'s SELECT policy for entries they're admin on (never, by
 * design) — Postgres checks that SELECT policy against an INSERT's
 * RETURNING output, so a staff member's own, otherwise-valid insert would
 * start failing outright the moment this asks for a representation back.
 * See the migration that creates this table for the full explanation.
 */
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const { error } = await supabase.from('activity').insert({
      type: input.type,
      message: input.message,
      actor_uid: input.actor.uid || '',
      actor_name: input.actor.name || 'Unknown',
      // meta is caller-supplied structured context (batchId, amount, etc.) —
      // always plain JSON-serializable data by convention, same contract as
      // the Firebase version's untyped meta field. Json's recursive union
      // can't be verified structurally against Record<string, unknown>.
      meta: (input.meta ?? null) as unknown as Json,
    });
    if (error) throw error;
  } catch (err) {
    console.warn('logActivity failed (non-fatal):', err);
  }
}

function fromRow(row: {
  id: string;
  type: string;
  message: string;
  actor_uid: string;
  actor_name: string;
  created_at: string;
  meta: unknown;
}): ActivityEntry {
  return {
    id: row.id,
    type: row.type as ActivityType,
    message: row.message,
    actorUid: row.actor_uid,
    actorName: row.actor_name,
    at: row.created_at,
    atMs: new Date(row.created_at).getTime(),
    meta: (row.meta as Record<string, unknown> | null) ?? undefined,
  };
}

/**
 * Fetch the activity feed, newest first. Returns `[]` for a staff caller —
 * RLS filters the read to nothing rather than erroring, same as it always
 * has (see the empty-select behaviour proved when this table's RLS was
 * built), so this never throws on a permission boundary.
 */
export async function fetchActivity(limit = 100): Promise<ActivityEntry[]> {
  const { data, error } = await supabase
    .from('activity')
    .select('id, type, message, actor_uid, actor_name, created_at, meta')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []).map(fromRow);
}
