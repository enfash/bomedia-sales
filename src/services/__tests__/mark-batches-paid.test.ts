/**
 * Bulk mark-paid must be all-or-nothing.
 *
 * A sequential loop failing on the sixth of ten invoices leaves five paid and
 * five not, with no rollback and nothing saying which.
 */

import { markBatchesPaid } from '@/services/sales-repository';
import { makeBatch } from '@/test-support/factories';

const mockCalls: Record<string, unknown>[] = [];
const mockState = { failNext: false };

jest.mock('@/services/db', () => ({
  dbService: {
    newKey: jest.fn(() => `-K${Math.random().toString(36).slice(2, 8)}`),
    increment: jest.fn((d: number) => ({ __increment: d })),
    updateAtomic: jest.fn(async (updates: Record<string, unknown>) => {
      if (mockState.failNext) throw new Error('network');
      mockCalls.push(updates);
    }),
  },
}));

const ACTOR = { uid: 'uid-admin', name: 'Elijah' };
const unpaid = (id: string, total = 10_000) =>
  makeBatch({ id, dbPath: `sales/2026/08/01/${id}`, totalAmount: total, totalPaid: 0, totalBalance: total });

beforeEach(() => { mockCalls.length = 0; mockState.failNext = false; });

describe('markBatchesPaid', () => {
  it('writes every batch in ONE atomic update', async () => {
    await markBatchesPaid([unpaid('A'), unpaid('B'), unpaid('C')], 'Cash', ACTOR);
    expect(mockCalls).toHaveLength(1);
  });

  it('that single update contains a ledger entry AND an increment per batch', async () => {
    await markBatchesPaid([unpaid('A'), unpaid('B')], 'Cash', ACTOR);
    const paths = Object.keys(mockCalls[0]);
    expect(paths.filter((p) => p.startsWith('payments/'))).toHaveLength(2);
    expect(paths.filter((p) => p.endsWith('/totalPaid'))).toHaveLength(2);
  });

  // The failure mode this replaces: five paid, five not, no report.
  it('writes NOTHING when the update fails — no partial settlement', async () => {
    mockState.failNext = true;
    await expect(markBatchesPaid([unpaid('A'), unpaid('B')], 'Cash', ACTOR)).rejects.toThrow('network');
    expect(mockCalls).toHaveLength(0);
  });

  it('returns only the batches it actually settled', async () => {
    const settled = await markBatchesPaid([unpaid('A'), unpaid('B')], 'POS', ACTOR);
    expect(settled.map((b) => b.id)).toEqual(['A', 'B']);
  });

  it('skips already-paid batches rather than writing zero-value entries', async () => {
    const paid = makeBatch({ id: 'PAID', dbPath: 'sales/x/PAID', totalAmount: 5_000, totalPaid: 5_000, totalBalance: 0 });
    const settled = await markBatchesPaid([unpaid('A'), paid], 'Cash', ACTOR);
    expect(settled.map((b) => b.id)).toEqual(['A']);
    expect(Object.keys(mockCalls[0]).filter((p) => p.startsWith('payments/'))).toHaveLength(1);
  });

  it('does not touch the database at all when everything is already paid', async () => {
    const paid = makeBatch({ id: 'P', dbPath: 'sales/x/P', totalAmount: 100, totalPaid: 100, totalBalance: 0 });
    expect(await markBatchesPaid([paid], 'Cash', ACTOR)).toEqual([]);
    expect(mockCalls).toHaveLength(0);
  });

  it('records the outstanding balance, not the full total', async () => {
    const part = makeBatch({ id: 'PART', dbPath: 'sales/x/PART', totalAmount: 10_000, totalPaid: 4_000, totalBalance: 6_000 });
    await markBatchesPaid([part], 'Cash', ACTOR);
    const entry = Object.entries(mockCalls[0]).find(([p]) => p.startsWith('payments/'))![1] as any;
    expect(entry.amount).toBe(6_000);
  });

  it('carries the chosen method onto every entry', async () => {
    await markBatchesPaid([unpaid('A'), unpaid('B')], 'Transfer', ACTOR);
    const entries = Object.entries(mockCalls[0])
      .filter(([p]) => p.startsWith('payments/'))
      .map(([, v]) => v as any);
    expect(entries.every((e) => e.method === 'Transfer')).toBe(true);
    expect(entries.every((e) => e.note === 'Marked paid in bulk from Records')).toBe(true);
  });
});
