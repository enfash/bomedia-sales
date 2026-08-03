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

const mockWritten: { path: string; node: StoredBatch }[] = [];
const mockOpeningEntries: { path: string; node: any }[] = [];
const mockRefs: { path: string; node: any }[] = [];

jest.mock('@/services/db', () => ({
  dbService: {
    setRecord: jest.fn(async (path: string, node: any) => {
      mockWritten.push({ path, node });
    }),
    // An advance is written as an opening ledger entry in the SAME atomic
    // update as the batch, so createBatch takes this path when totalPaid > 0.
    updateAtomic: jest.fn(async (updates: Record<string, any>) => {
      for (const [path, node] of Object.entries(updates)) {
        if (path.includes('/paymentRefs/')) mockRefs.push({ path, node });
        else if (path.startsWith('sales/')) mockWritten.push({ path, node });
        else mockOpeningEntries.push({ path, node });
      }
    }),
    newKey: jest.fn(() => '-OPENING'),
    increment: jest.fn((d: number) => ({ __increment: d })),
  },
}));

beforeEach(() => {
  mockWritten.length = 0;
  mockOpeningEntries.length = 0;
  mockRefs.length = 0;
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
  actor: { uid: 'uid-test', name: 'Tester' },
  items: [{ material: 'Vinyl', total: 600 }],
  ...over,
});

describe('createBatch always writes the money fields', () => {
  it('writes subtotal and adjustments on a normal sale', async () => {
    await createBatch(input());
    const node = mockWritten[0].node;
    expect(node.subtotal).toBe(600);
    expect(node.adjustments).toEqual([
      { kind: 'mov', label: 'Minimum order adjustment', amount: 400 },
    ]);
    expect(node.totalAmount).toBe(1000);
  });

  it('writes an explicit empty array when there are no adjustments', async () => {
    await createBatch(input({ subtotal: 1200, adjustments: [], totalAmount: 1200 }));
    const node = mockWritten[0].node;
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
      mockWritten.length = 0;
      await createBatch(c);
      const node = mockWritten[0].node;
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
    const node = mockWritten[0].node;
    expect(node.subtotal).toBe(563);
    expect(node.totalAmount).toBe(563);
    expect(node.totalPaid).toBe(100);
    expect(node.deliveryCost).toBe(100);
    expect(node.items!.item_0.total).toBe(563);
  });

  it('writes the batch under a local-day bucket matching its receiptId', async () => {
    await createBatch(input());
    expect(mockWritten[0].path).toMatch(/^sales\/\d{4}\/\d{2}\/\d{2}\/INV-260801-TEST$/);
  });

  /* ---------------------------------------------------------------- *
   * An advance taken at the counter IS a payment.
   *
   * Before this, `totalPaid` was written straight onto the batch with no
   * ledger entry — so every deposit was invisible to reconciliation and the
   * day's drawer was short by all of them.
   * ---------------------------------------------------------------- */
  it('writes an opening ledger entry when an advance is taken', async () => {
    await createBatch(input({ totalPaid: 5000 }));

    expect(mockOpeningEntries).toHaveLength(1);
    const [{ path, node }] = mockOpeningEntries;
    expect(path).toMatch(/^payments\/\d{4}-\d{2}-\d{2}\/uid-test\/-OPENING$/);
    expect(node.amount).toBe(5000);
    expect(node.byUid).toBe('uid-test');
    expect(node.note).toBe('Advance taken at sale');
  });

  it('writes the batch, the opening entry AND its ref in ONE atomic update', async () => {
    await createBatch(input({ totalPaid: 5000 }));
    // All three landed. A sale whose advance never reached the ledger, or an
    // entry no ref can find, are both inconsistencies this avoids.
    expect(mockWritten).toHaveLength(1);
    expect(mockOpeningEntries).toHaveLength(1);
    // The ref is NESTED in the node, not sent as its own path — RTDB rejects
    // an update containing both a path and a descendant of it.
    expect(Object.keys(mockWritten[0].node.paymentRefs ?? {})).toHaveLength(1);
    expect(mockRefs).toEqual([]);
  });

  it('the opening entry ref points at the entry that was written', async () => {
    await createBatch(input({ totalPaid: 5000 }));
    const [{ path: entryPath }] = mockOpeningEntries;
    const [[key, location]] = Object.entries(mockWritten[0].node.paymentRefs ?? {});
    // ref key === entry key, and its value locates the entry.
    expect(entryPath).toBe(`payments/${location}/${key}`);
  });

  it('writes no ref when there was no advance', async () => {
    await createBatch(input({ totalPaid: 0 }));
    expect(mockWritten[0].node.paymentRefs).toBeUndefined();
    expect(mockRefs).toEqual([]);
  });

  it('writes no ledger entry when nothing was paid up front', async () => {
    await createBatch(input({ totalPaid: 0 }));
    expect(mockOpeningEntries).toEqual([]);
    expect(mockWritten).toHaveLength(1);
  });

  it('rounds the advance before it reaches the ledger', async () => {
    await createBatch(input({ totalPaid: 562.5 }));
    expect(mockOpeningEntries[0].node.amount).toBe(563);
    expect(mockWritten[0].node.totalPaid).toBe(563);
  });

  it('carries the sale’s payment method onto the opening entry', async () => {
    await createBatch(input({ totalPaid: 1000, paymentMethod: 'Cash' }));
    expect(mockOpeningEntries[0].node.method).toBe('Cash');
  });
});

/**
 * Attribution, not decoration.
 *
 * The Records table used to render `records[0]?.loggedBy || 'Admin'` against a
 * field NOTHING had ever written, so every sale — staff sales included — was
 * attributed to an admin by a UI default. A record asserting an authority
 * claim its data does not support is the §1.4 UI-only-RBAC class of bug.
 */
describe('createBatch records who logged the sale', () => {
  it('writes both attribution fields from the actor', async () => {
    await createBatch(input({ actor: { uid: 'uid-office', name: 'Office' } }));
    const node = mockWritten[0].node;
    expect(node.loggedByUid).toBe('uid-office');
    expect(node.loggedByName).toBe('Office');
  });

  it('never writes a name without the uid that backs it', async () => {
    await createBatch(input());
    const node = mockWritten[0].node;
    // A name alone displays correctly and filters as nobody, and cannot be
    // checked against auth. Both fields travel together or neither does.
    expect(Boolean(node.loggedByName)).toBe(Boolean(node.loggedByUid));
  });

  it('attributes the sale to the same person as its opening ledger entry', async () => {
    await createBatch(input({ totalPaid: 400, actor: { uid: 'uid-office', name: 'Office' } }));
    expect(mockWritten[0].node.loggedByUid).toBe(mockOpeningEntries[0].node.byUid);
    expect(mockWritten[0].node.loggedByName).toBe(mockOpeningEntries[0].node.byName);
  });
});
