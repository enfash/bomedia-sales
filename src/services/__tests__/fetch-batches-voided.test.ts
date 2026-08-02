/**
 * `fetchBatchesByReceiptIds` is the SECOND read path into sales — it bypasses
 * `useRecords`, so chokepoint filtering never reaches it.
 *
 * A filter that eleven consumers get automatically and one gets by remembering
 * is the bug pattern this whole stage exists to prevent, so the default here is
 * pinned in both directions.
 */

import { fetchBatchesByReceiptIds } from '@/services/sales-repository';

const now = new Date().toISOString();

const tree = {
  '2026': {
    '08': {
      '01': {
        LIVE: {
          receiptId: 'LIVE', clientName: 'Acme', createdAt: now,
          subtotal: 10_000, adjustments: [], totalAmount: 10_000, totalPaid: 0,
          items: { item_0: { material: 'Vinyl', total: 10_000 } },
        },
        VOID: {
          receiptId: 'VOID', clientName: 'Ghost', createdAt: now,
          subtotal: 5_000, adjustments: [], totalAmount: 5_000, totalPaid: 0,
          voidedAt: now, voidedAtMs: Date.now(),
          voidedBy: 'uid-admin', voidedByName: 'Elijah', voidReason: 'cancelled',
          items: { item_0: { material: 'Vinyl', total: 5_000 } },
        },
      },
    },
  },
};

jest.mock('@/services/db', () => ({
  dbService: { getRecord: jest.fn(async () => mockTree) },
}));

const mockTree: any = tree;

describe('fetchBatchesByReceiptIds', () => {
  it('EXCLUDES voided by default', async () => {
    const found = await fetchBatchesByReceiptIds(['LIVE', 'VOID']);
    expect(found.map((b) => b.id)).toEqual(['LIVE']);
  });

  it('returns nothing when the only match is voided', async () => {
    expect(await fetchBatchesByReceiptIds(['VOID'])).toEqual([]);
  });

  // This is what keeps the VOIDED invoice reachable.
  it('resolves a voided batch when includeVoided is true', async () => {
    const found = await fetchBatchesByReceiptIds(['VOID'], true);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('VOID');
    expect(found[0].isVoided).toBe(true);
    expect(found[0].voidReason).toBe('cancelled');
    expect(found[0].voidedByName).toBe('Elijah');
  });

  it('returns both when asked for both', async () => {
    const found = await fetchBatchesByReceiptIds(['LIVE', 'VOID'], true);
    expect(found.map((b) => b.id).sort()).toEqual(['LIVE', 'VOID']);
  });

  it('a live batch is unaffected by the flag either way', async () => {
    const off = await fetchBatchesByReceiptIds(['LIVE']);
    const on = await fetchBatchesByReceiptIds(['LIVE'], true);
    expect(off).toEqual(on);
  });
});
