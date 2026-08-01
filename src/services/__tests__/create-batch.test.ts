/**
 * `createBatch` is the ONLY writer of sales batches, and the invariant the read
 * path now depends on is that it always writes `subtotal` and `adjustments[]`.
 *
 * `normalizeBatch` keeps a `?? totalAmount` default for those fields, but that
 * default exists solely for a device running a build from before they were
 * added. These tests are what make it unreachable for anything this codebase
 * writes, rather than merely unused.
 */

import type { StoredBatch } from '@/components/records/types';
import { createBatch } from '@/services/sales-repository';

const written: { path: string; node: StoredBatch }[] = [];

jest.mock('@/services/db', () => ({
  dbService: {
    setRecord: jest.fn(async (path: string, node: any) => {
      written.push({ path, node });
    }),
  },
}));

beforeEach(() => {
  written.length = 0;
});

const input = (over: Partial<Parameters<typeof createBatch>[0]> = {}) => ({
  receiptId: 'INV-260801-TEST',
  clientName: 'Acme Signs',
  subtotal: 600,
  adjustments: [{ kind: 'mov' as const, label: 'Minimum order adjustment', amount: 400 }],
  totalAmount: 1000,
  deliveryCost: 0,
  totalPaid: 0,
  paymentMethod: 'Transfer' as const,
  items: [{ material: 'Vinyl', total: 600 }],
  ...over,
});

describe('createBatch always writes the money fields', () => {
  it('writes subtotal and adjustments on a normal sale', async () => {
    await createBatch(input());
    const node = written[0].node;
    expect(node.subtotal).toBe(600);
    expect(node.adjustments).toEqual([
      { kind: 'mov', label: 'Minimum order adjustment', amount: 400 },
    ]);
    expect(node.totalAmount).toBe(1000);
  });

  it('writes an explicit empty array when there are no adjustments', async () => {
    await createBatch(input({ subtotal: 1200, adjustments: [], totalAmount: 1200 }));
    const node = written[0].node;
    expect(node.adjustments).toEqual([]);
    expect(node.adjustments).not.toBeUndefined();
  });

  it('never omits either field, whatever the inputs', async () => {
    const cases = [
      input(),
      input({ subtotal: 0, adjustments: [], totalAmount: 0, items: [] }),
      input({ subtotal: 1_000_000, adjustments: [], totalAmount: 1_000_000 }),
      input({ totalPaid: 1000 }),
      input({ notes: 'x', dueDate: '2026-09-01' }),
    ];
    for (const c of cases) {
      written.length = 0;
      await createBatch(c);
      const node = written[0].node;
      expect(Object.prototype.hasOwnProperty.call(node, 'subtotal')).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(node, 'adjustments')).toBe(true);
      expect(node.subtotal).not.toBeUndefined();
      expect(node.adjustments).not.toBeUndefined();
    }
  });

  it('rounds every money field at the write boundary', async () => {
    await createBatch(input({
      subtotal: 562.5,
      adjustments: [],
      totalAmount: 562.5,
      totalPaid: 100.4,
      deliveryCost: 99.6,
      items: [{ material: 'Vinyl', total: 562.5 }],
    }));
    const node = written[0].node;
    expect(node.subtotal).toBe(563);
    expect(node.totalAmount).toBe(563);
    expect(node.totalPaid).toBe(100);
    expect(node.deliveryCost).toBe(100);
    expect(node.items!.item_0.total).toBe(563);
  });

  it('writes the batch under a local-day bucket matching its receiptId', async () => {
    await createBatch(input());
    expect(written[0].path).toMatch(/^sales\/\d{4}\/\d{2}\/\d{2}\/INV-260801-TEST$/);
  });
});
