/**
 * RTDB rejects a multi-path `update()` where any path is an ancestor of
 * another:
 *
 *   "values argument contains a path /sales/…/INV-X that is ancestor of
 *    another path /sales/…/INV-X/paymentRefs/-Oz1…"
 *
 * This is a RUNTIME error with no type-level signal, and every unit test here
 * passed while `createBatch` shipped exactly that pair — it was caught by
 * recording a real sale, not by the suite. This guard covers every writer that
 * builds a multi-path update, so the next one cannot reintroduce it.
 */

import { createBatch, markBatchesPaid } from '@/services/sales-repository';
import { recordPayment } from '@/services/payment-repository';
import { makeBatch } from '@/test-support/factories';

const mockUpdates: Record<string, unknown>[] = [];

jest.mock('@/services/db', () => ({
  dbService: {
    newKey: jest.fn(() => '-KEY'),
    increment: jest.fn((d: number) => ({ __increment: d })),
    setRecord: jest.fn(async () => {}),
    updateAtomic: jest.fn(async (u: Record<string, unknown>) => {
      mockUpdates.push(u);
    }),
  },
}));

/** The exact rule Firebase enforces, restated. */
function ancestorPairs(paths: string[]): [string, string][] {
  const bad: [string, string][] = [];
  for (const a of paths) {
    for (const b of paths) {
      if (a !== b && b.startsWith(`${a}/`)) bad.push([a, b]);
    }
  }
  return bad;
}

const ACTOR = { uid: 'uid-a', name: 'Ada' };

const batchInput = (over: Record<string, any> = {}) => ({
  receiptId: 'INV-260802-AOBH',
  clientName: 'Acme',
  subtotal: 600,
  adjustments: [],
  totalAmount: 1000,
  deliveryCost: 0,
  totalPaid: 0,
  paymentMethod: 'Cash' as const,
  items: [{ material: 'Vinyl', total: 600 }],
  actor: ACTOR,
  ...over,
});

beforeEach(() => {
  mockUpdates.length = 0;
});

describe('the ancestor-path rule itself', () => {
  it('catches the exact pair that broke a real sale', () => {
    expect(
      ancestorPairs([
        'sales/2026/08/02/INV-260802-AOBH',
        'sales/2026/08/02/INV-260802-AOBH/paymentRefs/-Oz1',
      ]),
    ).toHaveLength(1);
  });

  it('allows siblings and unrelated roots', () => {
    expect(
      ancestorPairs([
        'sales/2026/08/02/INV-A/totalPaid',
        'sales/2026/08/02/INV-A/paymentRefs/-K1',
        'payments/2026-08-02/uid-a/-K1',
      ]),
    ).toEqual([]);
  });

  it('is not fooled by a shared prefix that is not a path boundary', () => {
    expect(ancestorPairs(['sales/INV-A', 'sales/INV-AB'])).toEqual([]);
  });
});

describe('no writer sends an ancestor and its descendant together', () => {
  it('createBatch WITH an advance — the case that failed', async () => {
    await createBatch(batchInput({ totalPaid: 5000 }));
    expect(mockUpdates).toHaveLength(1);
    expect(ancestorPairs(Object.keys(mockUpdates[0]))).toEqual([]);
  });

  it('createBatch with an advance still writes the ref, nested in the node', async () => {
    // The sale lands in TODAY's date bucket, so the path cannot be written out
    // literally — it changes at every midnight, and a hardcoded one silently
    // started reading `undefined` the day after this test was written. Take the
    // path from `createBatch` itself, which returns the node it wrote.
    const dbPath = await createBatch(batchInput({ totalPaid: 5000 }));
    const node = mockUpdates[0][dbPath] as any;
    expect(node.paymentRefs).toBeDefined();
    expect(Object.values(node.paymentRefs)).toHaveLength(1);
    // …and the ledger entry it points at is in the same update.
    const [, location] = Object.entries(node.paymentRefs)[0] as [string, string];
    expect(mockUpdates[0][`payments/${location}/-KEY`]).toBeDefined();
  });

  it('recordPayment', async () => {
    await recordPayment({
      batch: makeBatch({ dbPath: 'sales/2026/08/02/INV-A' }),
      amount: 1000,
      method: 'Cash',
      actor: ACTOR,
    });
    expect(ancestorPairs(Object.keys(mockUpdates[0]))).toEqual([]);
  });

  it('markBatchesPaid across several sales', async () => {
    await markBatchesPaid(
      [
        makeBatch({ id: 'A', dbPath: 'sales/2026/08/02/INV-A', totalAmount: 1000, totalPaid: 0, totalBalance: 1000 }),
        makeBatch({ id: 'B', dbPath: 'sales/2026/08/02/INV-B', totalAmount: 2000, totalPaid: 0, totalBalance: 2000 }),
      ],
      'Cash',
      ACTOR,
    );
    expect(mockUpdates).toHaveLength(1);
    expect(ancestorPairs(Object.keys(mockUpdates[0]))).toEqual([]);
  });
});
