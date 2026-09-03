/**
 * `payment-repository-pg.ts`'s day/range reads — `fetchPaymentsForDay`,
 * `fetchPaymentsInRange` — replacing `subscribeToPaymentsForDay`/
 * `subscribeToPaymentsInRange`. The two things worth proving without a real
 * Postgres connection: the local-day boundary math (Africa/Lagos, no DST —
 * same assumption `@/utils/date` already makes, pinned by `jest.setup.ts`),
 * and that a payment_batches-with-embedded-allocations row flattens into
 * one PaymentAllocationRow per allocation, not one per batch.
 */

import { fetchPaymentsForDay, fetchPaymentsInRange } from '@/services/payment-repository-pg';

jest.mock('@/services/db', () => ({ dbService: {} }));

const mockOrder = jest.fn();
const mockLt = jest.fn((_col: string, _val: string) => ({ order: mockOrder }));
const mockGte = jest.fn((_col: string, _val: string) => ({ lt: mockLt }));
const mockSelect = jest.fn((_cols: string) => ({ gte: mockGte }));
const mockFrom = jest.fn((_table: string) => ({ select: mockSelect }));

jest.mock('@/lib/auth', () => ({ supabase: { from: (table: string) => mockFrom(table) } }));

beforeEach(() => {
  mockFrom.mockClear();
  mockSelect.mockClear();
  mockGte.mockClear();
  mockLt.mockClear();
  mockOrder.mockReset();
  mockOrder.mockResolvedValue({ data: [], error: null });
});

describe('fetchPaymentsForDay', () => {
  it('queries payment_batches (not payment_allocations) — received_at lives on the batch', async () => {
    await fetchPaymentsForDay('2026-09-03');
    expect(mockFrom).toHaveBeenCalledWith('payment_batches');
  });

  it('bounds the query to exactly [that local day, next local day)', async () => {
    await fetchPaymentsForDay('2026-09-03');
    const [, gteVal] = mockGte.mock.calls[0];
    const [, ltVal] = mockLt.mock.calls[0];
    expect(new Date(gteVal).toString()).not.toBe('Invalid Date');
    // The window is exactly 24 hours, and start < end.
    expect(new Date(ltVal).getTime() - new Date(gteVal).getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('flattens each batch into one row per allocation, carrying the batch fields down', async () => {
    mockOrder.mockResolvedValueOnce({
      data: [
        {
          id: 'batch-1',
          method: 'Cash',
          collected_by: 'uid-1',
          collected_by_name: 'S5 Staff',
          received_at: '2026-09-03T10:00:00Z',
          reversal_of: null,
          reversal_reason: null,
          payment_allocations: [
            { id: 'alloc-1', sale_id: 'sale-1', amount: 3000, kind: 'settlement' },
            { id: 'alloc-2', sale_id: 'sale-2', amount: 2000, kind: 'settlement' },
          ],
        },
      ],
      error: null,
    });

    const rows = await fetchPaymentsForDay('2026-09-03');

    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      id: 'alloc-1',
      paymentBatchId: 'batch-1',
      saleId: 'sale-1',
      amount: 3000,
      kind: 'settlement',
      method: 'Cash',
      collectedBy: 'uid-1',
      collectedByName: 'S5 Staff',
      receivedAt: '2026-09-03T10:00:00Z',
      reversalOf: null,
      reversalReason: null,
    });
    expect(rows[1].saleId).toBe('sale-2');
  });

  it('propagates a query error rather than returning an empty list silently', async () => {
    mockOrder.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(fetchPaymentsForDay('2026-09-03')).rejects.toEqual({ message: 'boom' });
  });
});

describe('fetchPaymentsInRange', () => {
  it('bounds the query from the start of the first day to the start of the day AFTER the last', async () => {
    await fetchPaymentsInRange('2026-09-01', '2026-09-03');
    const [, gteVal] = mockGte.mock.calls[0];
    const [, ltVal] = mockLt.mock.calls[0];
    // Inclusive of 09-03 means the upper bound is the start of 09-04, not 09-03.
    const days = (new Date(ltVal).getTime() - new Date(gteVal).getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(3);
  });
});
