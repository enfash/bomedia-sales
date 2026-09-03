/**
 * What the operator is told when a write fails.
 *
 * The strings this replaces leaked internals at a person who cannot act on
 * them — "Failed to submit batch. Check your connection or Firebase config."
 * asks a counter operator to check a Firebase config. Every message here says
 * what happened and what to do next, in that order, and none of them names a
 * system the reader does not own.
 */

import { auth as firebaseAuth } from '@/lib/firebase';

export interface OperatorMessage {
  title: string;
  body: string;
}

/**
 * Firebase error codes arrive as `PERMISSION_DENIED` or `permission-denied`
 * with nothing useful in `.message`. Postgres/PostgREST errors are the
 * opposite: `.code` is always present but it's a bare SQLSTATE ("42501" for
 * an RLS rejection), and the human-readable part — "row-level security
 * policy" — is only in `.message`. Searching both concatenated, rather than
 * falling back to message only when code is empty, is what makes one set of
 * checks below work against either shape.
 */
function codeOf(error: unknown): string {
  if (typeof error !== 'object' || !error) return String(error ?? '').toLowerCase();
  const code = 'code' in error ? String((error as any).code ?? '') : '';
  const message =
    'message' in error ? String((error as any).message ?? '') : error instanceof Error ? error.message : '';
  return `${code} ${message}`.toLowerCase();
}

/**
 * A SQLSTATE is always exactly 5 characters — Firebase's `PERMISSION_DENIED`/
 * `permission-denied` never is. Used to gate the Firebase-bridge fallback
 * below to errors that could actually have come from Firebase: a genuine
 * Postgres 42501 must always read as "not allowed", regardless of whether
 * the (unrelated) Firebase Auth bridge session happens to be live at that
 * moment — the two are independent auth systems, and conflating them here
 * would blame the wrong thing for a real RLS denial.
 */
function isPostgresCode(error: unknown): boolean {
  if (typeof error !== 'object' || !error || !('code' in error)) return false;
  return /^[0-9a-z]{5}$/i.test(String((error as any).code ?? ''));
}

export function describeWriteError(error: unknown, what: string): OperatorMessage {
  const code = codeOf(error);

  // Live since the rules were enforced on 2026-08-03: before that this path
  // could not happen, because the database accepted anything from anyone.
  // 42501 is Postgres's SQLSTATE for an RLS/privilege rejection — the
  // Postgres-backed equivalent of Firebase's PERMISSION_DENIED.
  if (
    code.includes('permission_denied') ||
    code.includes('permission-denied') ||
    code.includes('42501') ||
    code.includes('row-level security')
  ) {
    // RTDB's rules deny for two genuinely different reasons that look
    // identical from the error alone: this account really doesn't have the
    // role for it, OR mint-firebase-token's bridge never established a
    // Firebase Auth session at all (see supabase/README.md → "Firebase Auth
    // bridge") — in which case blaming the operator's role sends them to ask
    // about the wrong thing. `firebaseAuth.currentUser` is the distinguishing
    // signal: null means no bridge session exists, so this can't be a real
    // role check at all — RTDB never got far enough to evaluate one.
    if (!firebaseAuth.currentUser && !isPostgresCode(error)) {
      return {
        title: `Could not ${what}`,
        body: 'The connection needed to save this did not start correctly. Try again in a moment — if it keeps failing, tell the owner exactly what this said.',
      };
    }
    return {
      title: `Not allowed to ${what}`,
      body: 'Your account does not have permission for this. Ask the owner to check your role, then try again.',
    };
  }

  if (code.includes('network') || code.includes('unavailable') || code.includes('failed to fetch')) {
    return {
      title: `Could not ${what}`,
      body: 'No connection reached the server. Write it on paper now, and enter it again once you are back online.',
    };
  }

  if (code.includes('auth') || code.includes('token') || code.includes('unauthenticated')) {
    return {
      title: 'Signed out',
      body: 'Your session ended. Sign in again, then re-enter this — it was not saved.',
    };
  }

  return {
    title: `Could not ${what}`,
    body: 'It was not saved. Write it on paper now, and try again — if it keeps failing, tell the owner what this said.',
  };
}
