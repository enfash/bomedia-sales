/**
 * Waiting for a money write to be ACKNOWLEDGED, without waiting forever.
 *
 * Offline, `await update(...)` never resolves: the SDK queues the write and the
 * promise simply never settles. The modal spins, the operator assumes it did
 * not work, and taps again — which under an append-only ledger queues a SECOND
 * entry. Every failure this bounds is a duplicate payment.
 *
 * WHY MONEY WAITS AT ALL. The prompt pack wanted every submit to resolve on
 * local acceptance. That is wrong here: with the security rules enforced, a
 * PERMISSION_DENIED arrives AFTER the local echo, so resolving early would show
 * the operator a payment and then delete it in front of them. A board move may
 * resolve optimistically — a wrong stage is visible and costs nothing — but a
 * payment shown and withdrawn is indistinguishable from data loss.
 */

/** The longest anyone waits at a counter for a server to answer. */
export const CONFIRM_WINDOW_MS = 10_000;

export type ConfirmOutcome =
  /** The server acknowledged it. The only outcome that means "saved". */
  | 'confirmed'
  /** The window elapsed with no answer. Unconfirmed — not failed, not saved. */
  | 'timeout'
  /** The socket went during the wait. Unconfirmed, and known sooner. */
  | 'disconnected'
  /** The server answered, and the answer was no. */
  | 'failed';

export interface ConfirmResult<T> {
  outcome: ConfirmOutcome;
  value?: T;
  error?: unknown;
}

export interface ConfirmDeps {
  windowMs?: number;
  /**
   * Resolves if the connection drops while waiting. Optional: without it the
   * wait simply runs its full length.
   *
   * ACTING ON A DISCONNECT IS NOT THE SAME as trusting `.info/connected`. A
   * disconnect moves the UI to a MORE cautious state — unconfirmed, write it on
   * paper — and a false one costs an unnecessary warning. A "connected" reading
   * is never used to claim a write is safe; only a server ack does that.
   */
  onDisconnect?: (notify: () => void) => () => void;
  /** Called each second with the whole seconds remaining, for the countdown. */
  onTick?: (secondsLeft: number) => void;
}

/**
 * Race the write against the clock and the connection.
 *
 * Note what is NOT done here: nothing is cancelled. The write stays queued in
 * the SDK and may still land after this returns — which is exactly why the
 * caller must mark it UNCONFIRMED rather than failed, and why the journal keeps
 * its entry until the server is asked directly.
 */
export function awaitConfirmation<T>(
  work: Promise<T>,
  deps: ConfirmDeps = {},
): Promise<ConfirmResult<T>> {
  const windowMs = deps.windowMs ?? CONFIRM_WINDOW_MS;

  return new Promise<ConfirmResult<T>>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ticker: ReturnType<typeof setInterval> | undefined;
    let unsubscribe: (() => void) | undefined;

    const finish = (result: ConfirmResult<T>) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (ticker) clearInterval(ticker);
      unsubscribe?.();
      resolve(result);
    };

    work.then(
      (value) => finish({ outcome: 'confirmed', value }),
      (error) => finish({ outcome: 'failed', error }),
    );

    if (settled) return; // an already-settled promise needs no clock

    let remaining = Math.ceil(windowMs / 1000);
    deps.onTick?.(remaining);
    ticker = setInterval(() => {
      remaining -= 1;
      deps.onTick?.(Math.max(0, remaining));
    }, 1000);

    timer = setTimeout(() => finish({ outcome: 'timeout' }), windowMs);

    // Subscribing may report the CURRENT state immediately. Already offline
    // means the answer is already known: do not make someone watch a ten-second
    // countdown for a server that cannot be reached.
    unsubscribe = deps.onDisconnect?.(() => finish({ outcome: 'disconnected' }));
  });
}

/** True when the write is not known to have saved — the caller must say so. */
export function isUnconfirmed(outcome: ConfirmOutcome): boolean {
  return outcome === 'timeout' || outcome === 'disconnected';
}
