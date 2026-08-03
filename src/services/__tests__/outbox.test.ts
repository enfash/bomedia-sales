/**
 * Replay, and the one rule that keeps it from being a duplicate-payment
 * generator.
 *
 * The first describe block is the safety invariant. It is not a performance
 * choice and must not be relaxed to "catch more" writes: `unverified` means the
 * server could not be asked, and money the server may already hold must never
 * be posted a second time on a guess.
 */

import {
  AUTO_REPLAY_MAX_AGE_MS,
  encodeIncrement,
  isAutoReplayable,
  replayMissing,
  type OutboxOp,
} from '@/services/outbox';
import { materialise } from '@/services/outbox-send';
import type { JournalEntry } from '@/services/pending-journal';

jest.mock('@/services/db', () => ({
  dbService: {
    increment: (delta: number) => ({ __sdkIncrement: delta }),
    updateAtomic: jest.fn(),
    setRecord: jest.fn(),
  },
}));

const NOW = 1_754_215_200_000;

const op = (): OutboxOp => ({
  kind: 'update',
  updates: {
    'payments/2026-08-03/uid-a/-K1': { amount: 900, method: 'POS' },
    'sales/2026/08/03/INV-A/totalPaid': encodeIncrement(900),
  },
});

const entry = (key: string, over: Partial<JournalEntry> = {}): JournalEntry => ({
  key,
  path: `payments/2026-08-03/uid-a/${key}`,
  kind: 'payment',
  amount: 900,
  method: 'POS',
  receiptId: 'INV-260803-AAAA',
  byUid: 'uid-a',
  byName: 'Office',
  at: '2026-08-03T10:00:00.000Z',
  atMs: NOW - 60_000,
  op: op(),
  ...over,
});

const deps = (send = jest.fn(async () => {}), clear = jest.fn(async () => {})) => ({
  send,
  clear,
  now: NOW,
});

describe('SAFETY INVARIANT — replay happens only on `missing`', () => {
  it('does NOT replay an unverified entry', async () => {
    // `unverified` means the server could not be asked. The write may already
    // be there. Sending it again would post the same money twice, and the
    // operator would have no way to tell which entry was the duplicate.
    const d = deps();
    const results = await replayMissing([entry('-K1')], new Set(), d);

    expect(d.send).not.toHaveBeenCalled();
    expect(d.clear).not.toHaveBeenCalled();
    expect(results[0].outcome).toBe('skipped-unverified');
  });

  it('does NOT replay an entry the server already has', async () => {
    const d = deps();
    // A landed entry is cleared by reconciliation, never handed here — but if
    // one arrives, it is not in `missing` and so is not sent.
    await replayMissing([entry('-K1')], new Set(), d);
    expect(d.send).not.toHaveBeenCalled();
  });

  it('replays exactly once when the server confirms it is absent', async () => {
    const d = deps();
    const results = await replayMissing([entry('-K1')], new Set(['-K1']), d);

    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.clear).toHaveBeenCalledWith('-K1');
    expect(results[0].outcome).toBe('sent');
  });

  it('sends only the missing ones out of a mixed batch', async () => {
    const d = deps();
    const entries = [entry('-A'), entry('-B'), entry('-C')];
    await replayMissing(entries, new Set(['-B']), d);

    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.clear).toHaveBeenCalledWith('-B');
  });
});

describe('ordering — sequential, in issue order, stopping at the first failure', () => {
  it('replays oldest first, whatever order they arrive in', async () => {
    const sent: string[] = [];
    const d = {
      send: jest.fn(async (o: OutboxOp) => {
        sent.push(Object.keys((o as any).updates)[0]);
      }),
      clear: jest.fn(async () => {}),
      now: NOW,
    };

    const entries = [
      entry('-NEW', { atMs: NOW - 1_000, op: { kind: 'update', updates: { 'p/new': 1 } } }),
      entry('-OLD', { atMs: NOW - 100_000, op: { kind: 'update', updates: { 'p/old': 1 } } }),
      entry('-MID', { atMs: NOW - 50_000, op: { kind: 'update', updates: { 'p/mid': 1 } } }),
    ];

    await replayMissing(entries, new Set(['-NEW', '-OLD', '-MID']), d);

    // A payment against a sale that has not landed yet is a payment against
    // nothing, so issue order is the only safe order.
    expect(sent).toEqual(['p/old', 'p/mid', 'p/new']);
  });

  it('stops at the first failure instead of burning the rest', async () => {
    const send = jest
      .fn<Promise<void>, [OutboxOp]>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('network gone'))
      .mockResolvedValue(undefined);
    const d = deps(send as any);

    const entries = [
      entry('-1', { atMs: NOW - 3_000 }),
      entry('-2', { atMs: NOW - 2_000 }),
      entry('-3', { atMs: NOW - 1_000 }),
    ];
    const results = await replayMissing(entries, new Set(['-1', '-2', '-3']), d);

    expect(send).toHaveBeenCalledTimes(2);
    expect(results.map((r) => r.outcome)).toEqual(['sent', 'failed']);
    // -3 was never attempted: the connection has gone, and it would have spent
    // its attempt failing.
    expect(results).toHaveLength(2);
  });

  it('never has two sends in flight at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const d = {
      send: jest.fn(async () => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
      }),
      clear: jest.fn(async () => {}),
      now: NOW,
    };

    await replayMissing(
      [entry('-1', { atMs: NOW - 3 }), entry('-2', { atMs: NOW - 2 }), entry('-3', { atMs: NOW - 1 })],
      new Set(['-1', '-2', '-3']),
      d,
    );

    expect(maxInFlight).toBe(1);
  });
});

describe('age cap — old entries are surfaced, not sent', () => {
  it('sends one just inside the cap', async () => {
    const d = deps();
    await replayMissing([entry('-K1', { atMs: NOW - AUTO_REPLAY_MAX_AGE_MS + 1_000 })], new Set(['-K1']), d);
    expect(d.send).toHaveBeenCalledTimes(1);
  });

  it('refuses one past the cap', async () => {
    // The shop has had half a day to notice and re-enter it by hand. A silent
    // post now is a duplicate nobody can trace to a cause.
    const d = deps();
    const results = await replayMissing(
      [entry('-K1', { atMs: NOW - AUTO_REPLAY_MAX_AGE_MS - 1 })],
      new Set(['-K1']),
      d,
    );

    expect(d.send).not.toHaveBeenCalled();
    expect(d.clear).not.toHaveBeenCalled(); // it stays, so it can be confirmed
    expect(results[0].outcome).toBe('skipped-too-old');
  });

  it('isAutoReplayable agrees with the cap, and needs a payload', () => {
    expect(isAutoReplayable(entry('-K1'), NOW)).toBe(true);
    expect(isAutoReplayable(entry('-K1', { atMs: NOW - AUTO_REPLAY_MAX_AGE_MS - 1 }), NOW)).toBe(false);
    expect(isAutoReplayable(entry('-K1', { op: undefined }), NOW)).toBe(false);
  });

  it('the cap is twelve hours', () => {
    expect(AUTO_REPLAY_MAX_AGE_MS).toBe(12 * 60 * 60 * 1000);
  });
});

describe('entries with no payload are reported, never guessed at', () => {
  it('skips an entry written before the outbox existed', async () => {
    const d = deps();
    const results = await replayMissing([entry('-OLD', { op: undefined })], new Set(['-OLD']), d);

    expect(d.send).not.toHaveBeenCalled();
    expect(results[0].outcome).toBe('no-payload');
  });
});

describe('increments survive storage', () => {
  it('rebuilds the SDK sentinel from the stored marker', () => {
    // JSON cannot carry ServerValue.increment, so the payload holds a marker
    // and the sentinel is rebuilt at write time. The SAME encoded object is
    // used for the original write, so a replay cannot drift from it.
    const round = JSON.parse(JSON.stringify(op())) as OutboxOp;
    const out = materialise((round as any).updates);

    expect(out['sales/2026/08/03/INV-A/totalPaid']).toEqual({ __sdkIncrement: 900 });
    expect(out['payments/2026-08-03/uid-a/-K1']).toEqual({ amount: 900, method: 'POS' });
  });

  it('leaves plain values alone', () => {
    expect(materialise({ 'a/b': 5, 'c/d': 'x' })).toEqual({ 'a/b': 5, 'c/d': 'x' });
  });
});
