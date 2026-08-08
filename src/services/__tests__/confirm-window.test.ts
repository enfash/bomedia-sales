/**
 * The bounded wait, and the distinction it exists to preserve.
 *
 * `timeout` and `disconnected` are NOT failures. The write is still queued in
 * the SDK and may land seconds later — so the caller must say "not confirmed",
 * never "did not save". A modal that reports failure for a write that then
 * arrives is how the same payment gets entered twice.
 */

import {
  CONFIRM_WINDOW_MS,
  awaitConfirmation,
  isUnconfirmed,
} from '@/services/confirm-window';

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

/** Runs pending microtasks so a resolved promise can settle under fake timers. */
const flush = () => Promise.resolve();

describe('the happy path', () => {
  it('resolves as confirmed when the server acks', async () => {
    const result = awaitConfirmation(Promise.resolve('ok'));
    await flush();
    await expect(result).resolves.toEqual({ outcome: 'confirmed', value: 'ok' });
  });

  it('reports a rejection as failed, not as a timeout', async () => {
    // The server ANSWERED — with a refusal. That is a different thing from
    // silence, and the modal stays open for it.
    const error = new Error('PERMISSION_DENIED');
    const result = awaitConfirmation(Promise.reject(error));
    await flush();
    await expect(result).resolves.toEqual({ outcome: 'failed', error });
  });

  it('does not wait on a promise that has already settled', async () => {
    const result = awaitConfirmation(Promise.resolve(1));
    await flush();
    // No timers should be left holding the process open.
    expect(jest.getTimerCount()).toBe(0);
    await result;
  });
});

describe('the bound', () => {
  it('times out after the window with no answer', async () => {
    const result = awaitConfirmation(new Promise(() => {}));
    jest.advanceTimersByTime(CONFIRM_WINDOW_MS);
    await expect(result).resolves.toEqual({ outcome: 'timeout' });
  });

  it('is ten seconds', () => {
    expect(CONFIRM_WINDOW_MS).toBe(10_000);
  });

  it('does not time out a moment early', async () => {
    let settled = false;
    const result = awaitConfirmation(new Promise(() => {})).then((r) => {
      settled = true;
      return r;
    });

    jest.advanceTimersByTime(CONFIRM_WINDOW_MS - 1);
    await flush();
    expect(settled).toBe(false);

    jest.advanceTimersByTime(1);
    await expect(result).resolves.toEqual({ outcome: 'timeout' });
  });

  it('counts down every second, so the wait is visibly finite', async () => {
    const ticks: number[] = [];
    const result = awaitConfirmation(new Promise(() => {}), { onTick: (s) => ticks.push(s) });

    jest.advanceTimersByTime(3000);
    // The first tick is immediate: a countdown that starts a second late reads
    // as a frozen button.
    expect(ticks.slice(0, 4)).toEqual([10, 9, 8, 7]);

    jest.advanceTimersByTime(CONFIRM_WINDOW_MS);
    await result;
  });

  it('never ticks below zero', async () => {
    const ticks: number[] = [];
    const result = awaitConfirmation(new Promise(() => {}), {
      windowMs: 2000,
      onTick: (s) => ticks.push(s),
    });
    jest.advanceTimersByTime(5000);
    await result;
    expect(Math.min(...ticks)).toBe(0);
  });
});

describe('the connection', () => {
  it('gives up early when the socket drops mid-wait', async () => {
    let drop: (() => void) | undefined;
    const result = awaitConfirmation(new Promise(() => {}), {
      onDisconnect: (notify) => {
        drop = notify;
        return () => {};
      },
    });

    jest.advanceTimersByTime(2000);
    drop!();
    await expect(result).resolves.toEqual({ outcome: 'disconnected' });
  });

  it('answers immediately when already offline', async () => {
    // Subscribing reports the current state, so this is the "airplane mode was
    // already on" case. Nobody should watch a ten-second countdown for a server
    // that cannot be reached.
    const result = awaitConfirmation(new Promise(() => {}), {
      onDisconnect: (notify) => {
        notify();
        return () => {};
      },
    });
    await expect(result).resolves.toEqual({ outcome: 'disconnected' });
  });

  it('unsubscribes once settled, whatever settled it', async () => {
    const unsubscribe = jest.fn();
    const result = awaitConfirmation(Promise.resolve('ok'), {
      onDisconnect: () => unsubscribe,
    });
    await flush();
    await result;
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('a disconnect after the ack changes nothing', async () => {
    let drop: (() => void) | undefined;
    const result = awaitConfirmation(Promise.resolve('ok'), {
      onDisconnect: (notify) => {
        drop = notify;
        return () => {};
      },
    });
    await flush();
    drop?.();
    // Confirmed is confirmed: the server already answered.
    await expect(result).resolves.toEqual({ outcome: 'confirmed', value: 'ok' });
  });
});

describe('isUnconfirmed — what the operator is told', () => {
  it('treats timeout and disconnect as not-known, never as failed', () => {
    expect(isUnconfirmed('timeout')).toBe(true);
    expect(isUnconfirmed('disconnected')).toBe(true);
  });

  it('does not treat a refusal as unconfirmed — that one IS an answer', () => {
    expect(isUnconfirmed('failed')).toBe(false);
    expect(isUnconfirmed('confirmed')).toBe(false);
  });
});
