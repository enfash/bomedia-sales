/**
 * `sales-repository-pg.ts`'s write side — `createSale` and its pure core.
 * Same split as `payment-repository-pg.test.ts`: the RPC's own correctness
 * (replay safety, atomicity, the bundled-opening-payment rollback) was
 * proven live against a real stack already; this covers the client wrapper
 * built on top of it, not yet wired to any screen.
 */

import { buildCreateSaleOp, createSale, journalEntryForSale, type NewSaleInput } from '@/services/sales-repository-pg';
import { list as journalList } from '@/services/pending-journal';
import type { OutboxOp } from '@/services/outbox';

jest.mock('@/services/db', () => ({ dbService: {} }));

const mockRpc = jest.fn(async (_fn: string, _args: unknown) => ({ data: null as unknown, error: null as any }));
jest.mock('@/lib/auth', () => ({ supabase: { rpc: (fn: string, args: unknown) => mockRpc(fn, args) } }));

const actor = { uid: 'staff-uid-1', name: 'Test Staff' };

beforeEach(() => {
  mockRpc.mockClear();
  mockRpc.mockResolvedValue({ data: null, error: null });
});

const baseInput: NewSaleInput = {
  clientId: 'client-1',
  clientName: 'Acme Signs',
  lines: [
    { material: 'Flex', width: '4', height: '2.5', jobUnit: 'ft', quantity: 3, unitPrice: 1000, total: 3000 },
  ],
  actor,
};

describe('buildCreateSaleOp', () => {
  it('passes feet dimensions through unchanged', () => {
    const op = buildCreateSaleOp(baseInput, 'INV-260830-AAAA') as Extract<OutboxOp, { kind: 'create_sale' }>;
    expect(op.payload.lines[0].width_ft).toBe(4);
    expect(op.payload.lines[0].height_ft).toBe(2.5);
    expect(op.payload.lines[0].job_unit).toBe('ft');
  });

  it('converts inches to canonical feet at numeric(10,4) precision, matching the inverse of formatDimension', () => {
    const input: NewSaleInput = {
      ...baseInput,
      lines: [{ material: 'SAV', width: '4', height: '2', jobUnit: 'in', quantity: 1, unitPrice: 100, total: 100 }],
    };
    const op = buildCreateSaleOp(input, 'INV-260830-AAAA') as Extract<OutboxOp, { kind: 'create_sale' }>;
    // 4in / 12 = 0.3333... rounded to 4dp, the same precision sale_lines stores.
    expect(op.payload.lines[0].width_ft).toBe(0.3333);
    expect(op.payload.lines[0].height_ft).toBe(0.1667);
  });

  it('maps adjustments with roundNaira applied', () => {
    const input: NewSaleInput = {
      ...baseInput,
      adjustments: [{ kind: 'delivery', label: 'Delivery', amount: 500.6 }],
    };
    const op = buildCreateSaleOp(input, 'INV-260830-AAAA') as Extract<OutboxOp, { kind: 'create_sale' }>;
    expect(op.payload.adjustments).toEqual([{ kind: 'delivery', label: 'Delivery', amount: 501 }]);
  });

  it('omits opening_payment when there is none', () => {
    const op = buildCreateSaleOp(baseInput, 'INV-260830-AAAA') as Extract<OutboxOp, { kind: 'create_sale' }>;
    expect(op.payload.opening_payment).toBeUndefined();
  });

  it('includes opening_payment only when a batch id was generated for it', () => {
    const input: NewSaleInput = { ...baseInput, openingPayment: { amount: 1000, method: 'Cash' } };
    const op = buildCreateSaleOp(input, 'INV-260830-AAAA', 'batch-1') as Extract<OutboxOp, { kind: 'create_sale' }>;
    expect(op.payload.opening_payment).toEqual({ payment_batch_id: 'batch-1', amount: 1000, method: 'Cash' });
  });

  it('throws rather than silently drop a positive opening payment with no batch id', () => {
    const input: NewSaleInput = { ...baseInput, openingPayment: { amount: 1000, method: 'Cash' } };
    expect(() => buildCreateSaleOp(input, 'INV-260830-AAAA')).toThrow(/payment_batch_id/);
  });
});

describe('journalEntryForSale', () => {
  it('sums lines + adjustments for the journalled amount, and namespaces the path', () => {
    const input: NewSaleInput = {
      ...baseInput,
      adjustments: [{ kind: 'delivery', label: 'Delivery', amount: 500 }],
    };
    const op = buildCreateSaleOp(input, 'INV-260830-AAAA') as Extract<OutboxOp, { kind: 'create_sale' }>;
    const entry = journalEntryForSale(op, actor, 'Acme Signs', new Date('2026-08-30T10:00:00Z'));
    expect(entry).toMatchObject({
      key: 'INV-260830-AAAA',
      path: 'pg:sales:INV-260830-AAAA',
      kind: 'sale',
      amount: 3500,
      receiptId: 'INV-260830-AAAA',
      clientName: 'Acme Signs',
      byUid: actor.uid,
      byName: actor.name,
    });
  });
});

describe('createSale', () => {
  it('calls create_sale with the exact argument names the RPC expects, and clears the journal on success', async () => {
    const { receiptNumber, openingPaymentBatchId } = await createSale(baseInput);

    expect(receiptNumber).toMatch(/^INV-\d{6}-[A-Z0-9]{4}$/);
    expect(openingPaymentBatchId).toBeUndefined();
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('create_sale', {
      p_receipt_number: receiptNumber,
      p_client_id: 'client-1',
      p_lines: [
        {
          material_type: 'Flex',
          width_ft: 4,
          height_ft: 2.5,
          job_unit: 'ft',
          quantity: 3,
          unit_price: 1000,
          total: 3000,
          eyelets: undefined,
          lamination: undefined,
          turnaround_time: undefined,
          job_name: undefined,
        },
      ],
      p_adjustments: [],
      p_notes: undefined,
      p_due_date: undefined,
      p_opening_payment: undefined,
    });

    expect(await journalList()).toHaveLength(0);
  });

  it('generates the opening payment batch id before issuing the write, and forwards it', async () => {
    const { openingPaymentBatchId } = await createSale({ ...baseInput, openingPayment: { amount: 1500, method: 'Transfer' } });

    expect(openingPaymentBatchId).toBeDefined();
    const call = mockRpc.mock.calls[0][1] as any;
    expect(call.p_opening_payment).toEqual({
      payment_batch_id: openingPaymentBatchId,
      amount: 1500,
      method: 'Transfer',
    });
  });

  it('re-throws the RPC error (e.g. insufficient stock rolling back a bundled opening payment) and still clears the journal', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'insufficient stock for line 1', code: 'P0001' } });

    await expect(createSale(baseInput)).rejects.toMatchObject({ message: 'insufficient stock for line 1' });
    expect(await journalList()).toHaveLength(0);
  });
});
