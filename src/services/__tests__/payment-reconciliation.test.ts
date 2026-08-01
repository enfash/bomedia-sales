import type { PaymentEntry, SalesBatch } from '@/components/records/types';
import {
  attachPayments,
  describeMismatch,
  summariseDay,
} from '@/services/payment-reconciliation';
import { makeBatch } from '@/test-support/factories';

const BATCH_A = 'sales/2026/08/01/INV-A';
const BATCH_B = 'sales/2026/08/01/INV-B';

let seq = 0;
const pay = (over: Partial<PaymentEntry> = {}): PaymentEntry => ({
  id: `-P${++seq}`,
  dbPath: `payments/2026-08-01/uid-a/-P${seq}`,
  dayKey: '2026-08-01',
  amount: 1000,
  method: 'Cash',
  at: '2026-08-01T10:00:00Z',
  atMs: seq,
  byUid: 'uid-a',
  byName: 'Ada',
  receiptId: 'INV-A',
  batchPath: BATCH_A,
  isReversal: false,
  ...over,
});

const batch = (over: Partial<SalesBatch> = {}): SalesBatch =>
  makeBatch({ dbPath: BATCH_A, totalAmount: 10_000, totalPaid: 0, ...over });

beforeEach(() => { seq = 0; });

describe('attachPayments', () => {
  it('attaches only the entries belonging to each sale', () => {
    const result = attachPayments(
      [batch({ dbPath: BATCH_A }), batch({ dbPath: BATCH_B, id: 'INV-B' })],
      [pay({ batchPath: BATCH_A }), pay({ batchPath: BATCH_B }), pay({ batchPath: BATCH_A })],
    );
    expect(result[0].payments).toHaveLength(2);
    expect(result[1].payments).toHaveLength(1);
  });

  it('sorts each sale’s payments newest first', () => {
    const result = attachPayments([batch()], [
      pay({ id: '-old', atMs: 1 }),
      pay({ id: '-new', atMs: 9 }),
    ]);
    expect(result[0].payments.map((p) => p.id)).toEqual(['-new', '-old']);
  });

  it('sums the ledger including reversals', () => {
    const result = attachPayments([batch({ totalPaid: 4000 })], [
      pay({ amount: 5000 }),
      pay({ amount: -1000, isReversal: true }),
    ]);
    expect(result[0].paymentsTotal).toBe(4000);
    expect(result[0].hasMismatch).toBe(false);
  });

  it('gives a sale with no payments a zero total, not a mismatch', () => {
    const result = attachPayments([batch({ totalPaid: 0 })], []);
    expect(result[0].paymentsTotal).toBe(0);
    expect(result[0].hasMismatch).toBe(false);
  });

  /* ---------------------------------------------------------------- *
   * THE LEDGER IS AUTHORITATIVE.
   * ---------------------------------------------------------------- */
  it('flags a cached totalPaid that disagrees with the ledger', () => {
    const result = attachPayments([batch({ totalPaid: 5000 })], [pay({ amount: 3000 })]);
    expect(result[0].hasMismatch).toBe(true);
    expect(result[0].paymentsTotal).toBe(3000);
    expect(result[0].mismatchDelta).toBe(-2000);
  });

  it('signs the delta so the direction of drift is visible', () => {
    const under = attachPayments([batch({ totalPaid: 1000 })], [pay({ amount: 3000 })]);
    expect(under[0].mismatchDelta).toBe(2000); // ledger has MORE than the cache

    const over = attachPayments([batch({ totalPaid: 3000 })], [pay({ amount: 1000 })]);
    expect(over[0].mismatchDelta).toBe(-2000); // cache claims more than the ledger
  });

  // A staff member reads only their own uid bucket, so their view of the
  // ledger is legitimately incomplete. Flagging that as a mismatch would be
  // crying wolf on every sale a colleague also took money for.
  it('does not flag mismatches when the caller can only see part of the ledger', () => {
    const result = attachPayments(
      [batch({ totalPaid: 5000 })],
      [pay({ amount: 3000 })],
      { trustMismatch: false },
    );
    expect(result[0].hasMismatch).toBe(false);
    // The delta is still computed — it is the flag that is suppressed.
    expect(result[0].mismatchDelta).toBe(-2000);
  });

  it('leaves every original batch field intact', () => {
    const [result] = attachPayments([batch({ clientName: 'Acme', totalAmount: 12_345 })], []);
    expect(result.clientName).toBe('Acme');
    expect(result.totalAmount).toBe(12_345);
  });
});

describe('describeMismatch', () => {
  it('states both figures and what to do, in words', () => {
    const [b] = attachPayments([batch({ totalPaid: 5000 })], [pay({ amount: 3000 })]);
    const text = describeMismatch(b, (n) => `₦${n.toLocaleString()}`);
    expect(text).toContain('₦3,000');
    expect(text).toContain('₦5,000');
    expect(text).toMatch(/payment list is the real record/i);
    expect(text).toMatch(/recalculate/i);
    expect(text).toMatch(/nothing is lost/i);
  });
});

describe('summariseDay', () => {
  const day = '2026-08-01';

  it('returns zeros for a day with no entries', () => {
    const s = summariseDay(day, []);
    expect(s).toMatchObject({ collected: 0, reversed: 0, net: 0, expectedCashInHand: 0 });
    expect(s.byMethod).toEqual([]);
    expect(s.byStaff).toEqual([]);
  });

  it('ignores entries filed under other days', () => {
    const s = summariseDay(day, [pay({ dayKey: '2026-07-31', amount: 9999 })]);
    expect(s.collected).toBe(0);
  });

  it('splits by method and drops methods with no entries', () => {
    const s = summariseDay(day, [
      pay({ method: 'Cash', amount: 3000 }),
      pay({ method: 'Cash', amount: 2000 }),
      pay({ method: 'POS', amount: 4000 }),
    ]);
    expect(s.byMethod.map((m) => m.method)).toEqual(['Cash', 'POS']);
    expect(s.byMethod.find((m) => m.method === 'Cash')!.net).toBe(5000);
    expect(s.byMethod.find((m) => m.method === 'Transfer')).toBeUndefined();
  });

  it('splits by staff, busiest first', () => {
    const s = summariseDay(day, [
      pay({ byUid: 'uid-a', byName: 'Ada', amount: 1000 }),
      pay({ byUid: 'uid-b', byName: 'Bode', amount: 7000 }),
    ]);
    expect(s.byStaff.map((x) => x.name)).toEqual(['Bode', 'Ada']);
    expect(s.byStaff[0].net).toBe(7000);
  });

  /* ---------------------------------------------------------------- *
   * A reversal is a CORRECTION, not negative income.
   * ---------------------------------------------------------------- */
  it('reports collected and reversed separately rather than netting them away', () => {
    const s = summariseDay(day, [
      pay({ amount: 50_000 }),
      pay({ amount: -50_000, isReversal: true }),
    ]);
    expect(s.collected).toBe(50_000);
    expect(s.reversed).toBe(50_000);
    expect(s.net).toBe(0);
  });

  it('a busy day that nets to zero does not look like a quiet day', () => {
    const busy = summariseDay(day, [pay({ amount: 50_000 }), pay({ amount: -50_000, isReversal: true })]);
    const quiet = summariseDay(day, []);
    expect(busy.net).toBe(quiet.net);
    expect(busy.collected).not.toBe(quiet.collected);
    expect(busy.entries).toHaveLength(2);
  });

  it('reports reversed as a positive figure', () => {
    const s = summariseDay(day, [pay({ amount: -2000, isReversal: true })]);
    expect(s.reversed).toBe(2000);
    expect(s.net).toBe(-2000);
  });

  /* ---------------------------------------------------------------- *
   * Only cash is countable.
   * ---------------------------------------------------------------- */
  it('expects only CASH in the drawer — POS and Transfer land in the bank', () => {
    const s = summariseDay(day, [
      pay({ method: 'Cash', amount: 10_000 }),
      pay({ method: 'POS', amount: 25_000 }),
      pay({ method: 'Transfer', amount: 40_000 }),
    ]);
    expect(s.collected).toBe(75_000);
    expect(s.expectedCashInHand).toBe(10_000);
  });

  it('takes a cash reversal back out of the expected drawer', () => {
    const s = summariseDay(day, [
      pay({ method: 'Cash', amount: 10_000 }),
      pay({ method: 'Cash', amount: -4_000, isReversal: true }),
    ]);
    expect(s.expectedCashInHand).toBe(6_000);
  });

  it('expects nothing in the drawer on a card-only day', () => {
    const s = summariseDay(day, [pay({ method: 'POS', amount: 25_000 })]);
    expect(s.collected).toBe(25_000);
    expect(s.expectedCashInHand).toBe(0);
  });

  it('lists the day’s entries newest first', () => {
    const s = summariseDay(day, [pay({ id: '-a', atMs: 1 }), pay({ id: '-b', atMs: 9 })]);
    expect(s.entries.map((e) => e.id)).toEqual(['-b', '-a']);
  });

  it('keeps method and staff totals consistent with the overall total', () => {
    const s = summariseDay(day, [
      pay({ method: 'Cash', byUid: 'uid-a', amount: 3000 }),
      pay({ method: 'POS', byUid: 'uid-b', amount: 5000 }),
      pay({ method: 'Cash', byUid: 'uid-b', amount: -1000, isReversal: true }),
    ]);
    expect(s.byMethod.reduce((sum, m) => sum + m.net, 0)).toBe(s.net);
    expect(s.byStaff.reduce((sum, x) => sum + x.net, 0)).toBe(s.net);
  });
});
