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

/** Firebase error codes arrive as `PERMISSION_DENIED` or `permission-denied`. */
function codeOf(error: unknown): string {
  const raw =
    (typeof error === 'object' && error && 'code' in error ? String((error as any).code) : '') ||
    (error instanceof Error ? error.message : String(error ?? ''));
  return raw.toLowerCase();
}

export function describeWriteError(error: unknown, what: string): OperatorMessage {
  const code = codeOf(error);

  // Live since the rules were enforced on 2026-08-03: before that this path
  // could not happen, because the database accepted anything from anyone.
  if (code.includes('permission_denied') || code.includes('permission-denied')) {
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
