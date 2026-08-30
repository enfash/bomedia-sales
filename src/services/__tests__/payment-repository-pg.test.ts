/**
 * `payment-repository-pg.ts` — tested without a real Postgres connection.
 * The RPC itself (create_sale/record_payment: replay safety, atomicity,
 * reversal, the deferred sum-check backstop) was proven live against a real
 * local Supabase stack during design/implementation of
 * `20260830160000_create_sale_and_record_payment.sql` — these tests cover
 * the layer added since: does this client wrapper build the right op, the
 * right journal entry, and call the RPC with the right argument names.
 */

import { buildRecordPaymentOp, journalEntryForPayment, recordPayment, reversePayment } from '@/services/payment-repository-pg';
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

describe('buildRecordPaymentOp', () => {
  it('rejects a zero/negative amount for a non-reversal payment', () => {
    expect(() =>
      buildRecordPaymentOp({ paymentBatchId: 'b1', saleId: 's1', amount: 0, method: 'Cash' }),
    ).toThrow(/greater than zero/);
  });

  it('rejects a reversal with no reason', () => {
    expect(() =>
      buildRecordPaymentOp({ paymentBatchId: 'b1', saleId: 's1', amount: -500, method: 'Cash', reversalOf: 'b0' }),
    ).toThrow(/must state a reason/);
  });

  it('allows a negative amount when it is a reversal with a reason', () => {
    const op = buildRecordPaymentOp({
      paymentBatchId: 'b1',
      saleId: 's1',
      amount: -500,
      method: 'Cash',
      reversalOf: 'b0',
      reversalReason: 'Wrong amount taken',
    });
    expect(op).toEqual({
      kind: 'record_payment',
      payload: {
        payment_batch_id: 'b1',
        sale_id: 's1',
        amount: -500,
        method: 'Cash',
        reversal_of: 'b0',
        reversal_reason: 'Wrong amount taken',
      },
    });
  });
});

describe('journalEntryForPayment', () => {
  it('namespaces the path so a single ExistenceCheck can tell it apart from a Firebase path', () => {
    const op = buildRecordPaymentOp({ paymentBatchId: 'b1', saleId: 's1', amount: 2000, method: 'Transfer' }) as Extract<
      OutboxOp,
      { kind: 'record_payment' }
    >;
    const entry = journalEntryForPayment(op, actor, 'INV-260830-AAAA', new Date('2026-08-30T10:00:00Z'));
    expect(entry).toMatchObject({
      key: 'b1',
      path: 'pg:payment_batches:b1',
      kind: 'payment',
      amount: 2000,
      method: 'Transfer',
      receiptId: 'INV-260830-AAAA',
      byUid: actor.uid,
      byName: actor.name,
    });
  });

  it('marks a reversal with kind "reversal", not "payment"', () => {
    const op = buildRecordPaymentOp({
      paymentBatchId: 'b1',
      saleId: 's1',
      amount: -2000,
      method: 'Cash',
      reversalOf: 'b0',
      reversalReason: 'test',
    }) as Extract<OutboxOp, { kind: 'record_payment' }>;
    const entry = journalEntryForPayment(op, actor, 'INV-260830-AAAA');
    expect(entry.kind).toBe('reversal');
  });
});

describe('recordPayment', () => {
  it('calls the RPC with the exact argument names create_sale/record_payment expects, and clears the journal on success', async () => {
    const batchId = await recordPayment({
      saleId: 'sale-1',
      receiptNumber: 'INV-260830-AAAA',
      amount: 2000,
      method: 'Cash',
      actor,
    });

    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('record_payment', {
      p_payment_batch_id: batchId,
      p_sale_id: 'sale-1',
      p_amount: 2000,
      p_method: 'Cash',
      p_reversal_of: undefined,
      p_reversal_reason: undefined,
    });

    // journalled() clears on success — nothing should be left pending.
    expect(await journalList()).toHaveLength(0);
  });

  it('re-throws the RPC error and still clears the journal entry (a definitive refusal, not a lost write)', async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'insufficient stock', code: 'P0001' } });

    await expect(
      recordPayment({ saleId: 'sale-1', receiptNumber: 'INV-260830-AAAA', amount: 2000, method: 'Cash', actor }),
    ).rejects.toMatchObject({ message: 'insufficient stock' });

    expect(await journalList()).toHaveLength(0);
  });
});

describe('reversePayment', () => {
  it('negates the amount and sends reversal_of/reversal_reason', async () => {
    await reversePayment({
      originalPaymentBatchId: 'original-batch',
      saleId: 'sale-1',
      receiptNumber: 'INV-260830-AAAA',
      amount: 2000,
      method: 'Cash',
      reason: 'Customer refund',
      actor,
    });

    expect(mockRpc).toHaveBeenCalledWith(
      'record_payment',
      expect.objectContaining({
        p_amount: -2000,
        p_reversal_of: 'original-batch',
        p_reversal_reason: 'Customer refund',
      }),
    );
  });
});
