/**
 * What the operator is told when a write fails.
 *
 * The strings this replaces leaked internals at a person who cannot act on
 * them — "Failed to submit batch. Check your connection or Firebase config."
 * asks a counter operator to check a Firebase config. Every message here says
 * what happened and what to do next, in that order, and none of them names a
 * system the reader does not own.
 */

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
