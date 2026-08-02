/**
 * The payment ledger's risky parts, tested without Firebase.
 *
 * The two that matter most: the entry and the totalPaid increment must go in
 * ONE atomic update, and concurrent payments must both land.
 */

import type { PaymentEntry, SalesBatch } from '@/components/records/types';
import {
  buildPaymentWrite,
  normalizePayment,
  parsePaymentsTree,
  recalculateTotalPaid,
  recordPayment,
  reversePayment,
} from '@/services/payment-repository';

/** Captures every atomic update so we can assert on the exact payload.
 *  `mock` prefixes are required by babel-plugin-jest-hoist. */
const mockUpdates: Record<string, any>[] = [];
const mockPlainUpdates: { path: string; data: any }[] = [];
let mockKeyCounter = 0;

jest.mock('@/services/db', () => ({
  dbService: {
    newKey: jest.fn(() => `-KEY${++mockKeyCounter}`),
    updateAtomic: jest.fn(async (u: Record<string, any>) => {
      mockUpdates.push(u);
    }),
    updateRecord: jest.fn(async (path: string, data: any) => {
      mockPlainUpdates.push({ path, data });
    }),
    // A recognisable stand-in for the server sentinel.
    increment: jest.fn((delta: number) => ({ __increment: delta })),
    subscribe: jest.fn(),
  },
}));

const NOW = new Date('2026-08-01T14:30:00+01:00');

const BATCH = {
  dbPath: 'sales/2026/08/01/INV-260801-AAAA',
  id: 'INV-260801-AAAA',
  receiptId: 'INV-260801-AAAA',
} as Pick<SalesBatch, 'dbPath' | 'id' | 'receiptId'>;

const ACTOR = { uid: 'uid-elijah', name: 'Elijah' };

beforeEach(() => {
  mockUpdates.length = 0;
  mockPlainUpdates.length = 0;
  mockKeyCounter = 0;
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => jest.useRealTimers());

describe('buildPaymentWrite', () => {
  const build = (over: Partial<Parameters<typeof buildPaymentWrite>[0]> = {}) =>
    buildPaymentWrite({
      batch: BATCH, amount: 5000, method: 'Cash', actor: ACTOR, key: '-KEY1', now: NOW, ...over,
    });

  it('files the entry under the PAYMENT date, not the sale date', () => {
    // The sale is from July; the payment is taken in August.
    const write = build({
      batch: { ...BATCH, dbPath: 'sales/2026/07/15/INV-260715-OLD' },
    });
    expect(write.dayKey).toBe('2026-08-01');
    expect(write.paymentPath).toBe('payments/2026-08-01/uid-elijah/-KEY1');
    expect(write.totalPaidPath).toBe('sales/2026/07/15/INV-260715-OLD/totalPaid');
  });

  it('rounds the amount at the write boundary', () => {
    const write = build({ amount: 562.5 });
    expect(write.entry.amount).toBe(563);
    expect(write.delta).toBe(563);
  });

  it('records who took it, by uid and name', () => {
    const write = build();
    expect(write.entry.byUid).toBe('uid-elijah');
    expect(write.entry.byName).toBe('Elijah');
    // The uid appears in the path too — the rules require they match.
    expect(write.paymentPath).toContain('/uid-elijah/');
  });

  it('carries method, receipt and batch path so the ledger needs no join', () => {
    const write = build({ method: 'POS' });
    expect(write.entry.method).toBe('POS');
    expect(write.entry.receiptId).toBe('INV-260801-AAAA');
    expect(write.entry.batchPath).toBe(BATCH.dbPath);
  });

  it('omits an empty note rather than writing a blank string', () => {
    expect(build({ note: '   ' }).entry.note).toBeUndefined();
    expect(build({ note: ' cash in envelope ' }).entry.note).toBe('cash in envelope');
  });

  it('rejects a zero or negative amount that is not a reversal', () => {
    expect(() => build({ amount: 0 })).toThrow(/greater than zero/i);
    expect(() => build({ amount: -100 })).toThrow(/greater than zero/i);
  });

  it('rejects a reversal with no reason', () => {
    expect(() => build({ amount: -5000, reversalOf: '-KEY0', reversalReason: '  ' }))
      .toThrow(/reason/i);
  });

  it('accepts a negative amount when it is a properly formed reversal', () => {
    const write = build({ amount: -5000, reversalOf: '-KEY0', reversalReason: 'Keyed twice' });
    expect(write.entry.amount).toBe(-5000);
    expect(write.entry.reversalOf).toBe('-KEY0');
    expect(write.entry.reversalReason).toBe('Keyed twice');
  });
});

describe('recordPayment', () => {
  it('writes the entry and the increment in ONE atomic update', async () => {
    await recordPayment({ batch: BATCH, amount: 5000, method: 'Cash', actor: ACTOR });

    expect(mockUpdates).toHaveLength(1);
    const paths = Object.keys(mockUpdates[0]);
    expect(paths).toHaveLength(3);
    expect(paths).toContain('payments/2026-08-01/uid-elijah/-KEY1');
    expect(paths).toContain('sales/2026/08/01/INV-260801-AAAA/totalPaid');
  });

  it('moves totalPaid by a server increment, never a computed absolute', async () => {
    await recordPayment({ batch: BATCH, amount: 5000, method: 'Cash', actor: ACTOR });
    const value = mockUpdates[0]['sales/2026/08/01/INV-260801-AAAA/totalPaid'];
    expect(value).toEqual({ __increment: 5000 });
    // The old bug: writing `batch.totalPaid + amount` read from client state.
    expect(typeof value).not.toBe('number');
  });

  /* ---------------------------------------------------------------- *
   * CONCURRENT SAFETY — the reason this stage exists.
   * ---------------------------------------------------------------- */
  it('two devices paying the same invoice both land', async () => {
    const deviceA = { uid: 'uid-a', name: 'Ada' };
    const deviceB = { uid: 'uid-b', name: 'Bode' };

    await Promise.all([
      recordPayment({ batch: BATCH, amount: 3000, method: 'Cash', actor: deviceA }),
      recordPayment({ batch: BATCH, amount: 2000, method: 'POS', actor: deviceB }),
    ]);

    expect(mockUpdates).toHaveLength(2);

    // Distinct ledger entries, in different uid buckets — neither overwrites.
    const entryPaths = mockUpdates.map((u) => Object.keys(u).find((k) => k.startsWith('payments/'))!);
    expect(new Set(entryPaths).size).toBe(2);
    expect(entryPaths.some((p) => p.includes('/uid-a/'))).toBe(true);
    expect(entryPaths.some((p) => p.includes('/uid-b/'))).toBe(true);

    // Both increments are relative, so the server applies both: +3000 then
    // +2000 = +5000. Under read-modify-write one would have erased the other.
    const deltas = mockUpdates.map((u) => u[`${BATCH.dbPath}/totalPaid`].__increment);
    expect(deltas.sort()).toEqual([2000, 3000]);
    expect(deltas.reduce((a, b) => a + b, 0)).toBe(5000);
  });

  it('returns the new entry key', async () => {
    const key = await recordPayment({ batch: BATCH, amount: 100, method: 'Cash', actor: ACTOR });
    expect(key).toBe('-KEY1');
  });
});

describe('reversePayment', () => {
  const original: PaymentEntry = {
    id: '-ORIG',
    dbPath: 'payments/2026-07-30/uid-elijah/-ORIG',
    dayKey: '2026-07-30',
    amount: 5000,
    method: 'Cash',
    at: '2026-07-30T10:00:00.000Z',
    atMs: Date.parse('2026-07-30T10:00:00.000Z'),
    byUid: 'uid-elijah',
    byName: 'Elijah',
    receiptId: 'INV-260801-AAAA',
    batchPath: BATCH.dbPath,
    isReversal: false,
  };

  it('negates the amount exactly', async () => {
    await reversePayment(original, 'Keyed twice', ACTOR);
    const entry = mockUpdates[0]['payments/2026-08-01/uid-elijah/-KEY1'];
    expect(entry.amount).toBe(-5000);
    expect(mockUpdates[0][`${BATCH.dbPath}/totalPaid`]).toEqual({ __increment: -5000 });
  });

  it('leaves the original untouched — the update never names its path', async () => {
    await reversePayment(original, 'Keyed twice', ACTOR);
    expect(Object.keys(mockUpdates[0])).not.toContain(original.dbPath);
  });

  it('files the reversal under TODAY, not the original payment date', async () => {
    await reversePayment(original, 'Keyed twice', ACTOR);
    // Money left the drawer today; that is the day that must reconcile.
    expect(Object.keys(mockUpdates[0]).some((k) => k.startsWith('payments/2026-08-01/'))).toBe(true);
  });

  it('records what it reverses and why', async () => {
    await reversePayment(original, 'Customer paid by transfer instead', ACTOR);
    const entry = mockUpdates[0]['payments/2026-08-01/uid-elijah/-KEY1'];
    expect(entry.reversalOf).toBe('-ORIG');
    expect(entry.reversalReason).toBe('Customer paid by transfer instead');
  });

  it('refuses without a reason', async () => {
    await expect(reversePayment(original, '   ', ACTOR)).rejects.toThrow(/reason/i);
    expect(mockUpdates).toHaveLength(0);
  });

  it('refuses to reverse a reversal', async () => {
    const reversal = { ...original, isReversal: true, reversalOf: '-SOMETHING' };
    await expect(reversePayment(reversal, 'undo', ACTOR)).rejects.toThrow(/cannot itself/i);
    expect(mockUpdates).toHaveLength(0);
  });

  it('nets to zero when a payment is reversed in full', async () => {
    await recordPayment({ batch: BATCH, amount: 5000, method: 'Cash', actor: ACTOR });
    await reversePayment(original, 'Keyed twice', ACTOR);
    const net = mockUpdates
      .map((u) => u[`${BATCH.dbPath}/totalPaid`].__increment)
      .reduce((a, b) => a + b, 0);
    expect(net).toBe(0);
  });
});

describe('parsePaymentsTree', () => {
  const tree = {
    '2026-08-01': {
      'uid-a': {
        '-P1': { amount: 3000, method: 'Cash', at: '2026-08-01T09:00:00Z', atMs: 3, byUid: 'uid-a', byName: 'Ada', receiptId: 'INV-1', batchPath: 'sales/x' },
        '-P2': { amount: 1000, method: 'POS', at: '2026-08-01T11:00:00Z', atMs: 5, byUid: 'uid-a', byName: 'Ada', receiptId: 'INV-2', batchPath: 'sales/y' },
      },
      'uid-b': {
        '-P3': { amount: 2000, method: 'Transfer', at: '2026-08-01T10:00:00Z', atMs: 4, byUid: 'uid-b', byName: 'Bode', receiptId: 'INV-1', batchPath: 'sales/x' },
      },
    },
  };

  it('returns an empty list for an empty or malformed tree', () => {
    for (const root of [null, undefined, {}, 'nonsense', 42]) {
      expect(parsePaymentsTree(root)).toEqual([]);
    }
  });

  it('flattens day and uid buckets into one list', () => {
    expect(parsePaymentsTree(tree)).toHaveLength(3);
  });

  it('sorts newest first', () => {
    expect(parsePaymentsTree(tree).map((p) => p.id)).toEqual(['-P2', '-P3', '-P1']);
  });

  it('reconstructs each entry dbPath from its day and uid bucket', () => {
    const p = parsePaymentsTree(tree).find((x) => x.id === '-P3')!;
    expect(p.dbPath).toBe('payments/2026-08-01/uid-b/-P3');
    expect(p.dayKey).toBe('2026-08-01');
    expect(p.byUid).toBe('uid-b');
  });

  // A staff member can only read their own bucket, so this is the shape they
  // actually receive. It must not throw or drop entries.
  it('handles the partial tree a staff member sees', () => {
    const partial = { '2026-08-01': { 'uid-a': tree['2026-08-01']['uid-a'] } };
    const result = parsePaymentsTree(partial);
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.byUid === 'uid-a')).toBe(true);
  });

  it('skips non-object junk at any level rather than throwing', () => {
    expect(parsePaymentsTree({ '2026-08-01': { 'uid-a': { '-P1': null } }, bad: 7 })).toEqual([]);
  });
});

describe('normalizePayment', () => {
  it('flags a reversal without inspecting the sign', () => {
    const p = normalizePayment(
      { amount: -500, reversalOf: '-X', reversalReason: 'why' }, '-R', '2026-08-01', 'uid-a');
    expect(p.isReversal).toBe(true);
  });

  it('does not treat an ordinary payment as a reversal', () => {
    expect(normalizePayment({ amount: 500 }, '-P', '2026-08-01', 'uid-a').isReversal).toBe(false);
  });

  it('rounds a stored amount defensively', () => {
    expect(normalizePayment({ amount: 562.5 }, '-P', '2026-08-01', 'uid-a').amount).toBe(563);
  });

  it('fills defaults for a sparse entry', () => {
    const p = normalizePayment({}, '-P', '2026-08-01', 'uid-a');
    expect(p.amount).toBe(0);
    expect(p.method).toBe('Cash');
    expect(p.byUid).toBe('uid-a');
    expect(p.byName).toBe('Unknown');
  });
});

describe('recalculateTotalPaid', () => {
  const entry = (amount: number): PaymentEntry => ({
    id: `-${amount}`, dbPath: '', dayKey: '2026-08-01', amount, method: 'Cash',
    at: '', atMs: 0, byUid: 'u', byName: 'n', receiptId: 'INV-1',
    batchPath: BATCH.dbPath, isReversal: amount < 0,
  });

  it('writes the sum of the ledger, including reversals', async () => {
    const total = await recalculateTotalPaid(BATCH, [entry(5000), entry(2000), entry(-1000)]);
    expect(total).toBe(6000);
    expect(mockPlainUpdates).toEqual([{ path: BATCH.dbPath, data: { totalPaid: 6000 } }]);
  });

  it('writes zero when every payment has been reversed', async () => {
    expect(await recalculateTotalPaid(BATCH, [entry(5000), entry(-5000)])).toBe(0);
  });

  it('cannot invent money — its only input is the entries', async () => {
    expect(await recalculateTotalPaid(BATCH, [])).toBe(0);
    expect(mockPlainUpdates[0].data.totalPaid).toBe(0);
  });
});
