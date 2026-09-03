/**
 * `sales-repository-pg.ts`'s newly-built write/list functions —
 * `updateProductionStage`, `updateBatchDetails`, `voidBatch`,
 * `markBatchesPaid` — tested without a real Postgres connection. Each is
 * either a thin wrapper RLS already gates server-side, or (markBatchesPaid)
 * a client wrapper around a dedicated atomic RPC — the RPC's own atomicity
 * is proven live/separately; this covers argument construction and
 * response mapping.
 */

import {
  markBatchesPaid,
  updateBatchDetails,
  updateProductionStage,
  voidBatch,
} from '@/services/sales-repository-pg';

jest.mock('@/services/db', () => ({ dbService: {} }));

const mockEq = jest.fn((_col: string, _val: unknown) => ({ error: null as any }));
const mockIn = jest.fn((_col: string, _vals: unknown[]) => ({ error: null as any }));
const mockUpdate = jest.fn((_patch: unknown) => ({ eq: mockEq, in: mockIn }));
const mockFrom = jest.fn((_table: string) => ({ update: mockUpdate }));
const mockRpc = jest.fn(async (_fn: string, _args: unknown) => ({ data: [] as unknown, error: null as any }));

jest.mock('@/lib/auth', () => ({
  supabase: {
    from: (table: string) => mockFrom(table),
    rpc: (fn: string, args: unknown) => mockRpc(fn, args),
  },
}));

const actor = { uid: 'admin-uid-1', name: 'Test Admin' };

beforeEach(() => {
  mockFrom.mockClear();
  mockUpdate.mockClear();
  mockEq.mockClear();
  mockIn.mockClear();
  mockRpc.mockClear();
  mockRpc.mockResolvedValue({ data: [], error: null });
});

describe('updateProductionStage', () => {
  it('updates job_status for exactly one sale, by id', async () => {
    await updateProductionStage('sale-1', 'Printing');
    expect(mockFrom).toHaveBeenCalledWith('sales');
    expect(mockUpdate).toHaveBeenCalledWith({ job_status: 'Printing' });
    expect(mockEq).toHaveBeenCalledWith('id', 'sale-1');
  });
});

describe('updateBatchDetails', () => {
  it('only sends the fields actually provided', async () => {
    await updateBatchDetails(['sale-1', 'sale-2'], { notes: 'Rush order' });
    expect(mockUpdate).toHaveBeenCalledWith({ notes: 'Rush order' });
    expect(mockIn).toHaveBeenCalledWith('id', ['sale-1', 'sale-2']);
  });

  it('maps dueDate to due_date', async () => {
    await updateBatchDetails(['sale-1'], { dueDate: '2026-09-10' });
    expect(mockUpdate).toHaveBeenCalledWith({ due_date: '2026-09-10' });
  });

  it('no-ops rather than issuing an empty update', async () => {
    await updateBatchDetails(['sale-1'], {});
    expect(mockFrom).not.toHaveBeenCalled();
  });
});

describe('voidBatch', () => {
  it('rejects an empty reason before any query', async () => {
    await expect(voidBatch('sale-1', '   ', actor)).rejects.toThrow(/reason is required/);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('sets every void field, trimmed, attributed to the actor', async () => {
    await voidBatch('sale-1', '  Customer cancelled  ', actor);
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        is_voided: true,
        voided_by: 'admin-uid-1',
        voided_by_name: 'Test Admin',
        void_reason: 'Customer cancelled',
      }),
    );
    expect(mockEq).toHaveBeenCalledWith('id', 'sale-1');
  });
});

describe('markBatchesPaid', () => {
  it('generates one payment_batch_id per sale and calls the RPC once', async () => {
    await markBatchesPaid(['sale-1', 'sale-2'], 'Cash', actor);

    expect(mockRpc).toHaveBeenCalledTimes(1);
    const [fn, args] = mockRpc.mock.calls[0];
    expect(fn).toBe('mark_batches_paid');
    expect((args as any).p_sale_ids).toEqual(['sale-1', 'sale-2']);
    expect((args as any).p_method).toBe('Cash');
    expect((args as any).p_payment_batch_ids).toHaveLength(2);
    // Distinct ids, not the same one reused across sales.
    expect(new Set((args as any).p_payment_batch_ids).size).toBe(2);
  });

  it('maps the RPC response back to settled/amountPaid per sale', async () => {
    mockRpc.mockResolvedValueOnce({
      data: [
        { sale_id: 'sale-1', settled: true, amount_paid: 5000 },
        { sale_id: 'sale-2', settled: false, amount_paid: 0 },
      ],
      error: null,
    });

    const result = await markBatchesPaid(['sale-1', 'sale-2'], 'Transfer', actor);

    expect(result).toEqual([
      { saleId: 'sale-1', settled: true, amountPaid: 5000 },
      { saleId: 'sale-2', settled: false, amountPaid: 0 },
    ]);
  });

  it('does not call the RPC for an empty selection', async () => {
    const result = await markBatchesPaid([], 'Cash', actor);
    expect(result).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});
