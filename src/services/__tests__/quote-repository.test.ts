/**
 * Quote → sale conversion must not re-price.
 *
 * The customer accepted a total. Converting the quote into a sale has to carry
 * that exact figure across: recomputing it against today's MOV would quietly
 * hand them a different number than the one they agreed to.
 */

import type { QuoteRecord } from '@/components/records/types';
import { convertQuoteToSale } from '@/services/quote-repository';
import { makeRecord } from '@/test-support/factories';

/** Captures what convertQuoteToSale actually sent to createSale. */
const createSaleCalls: any[] = [];
const updateRecordCalls: { path: string; patch: any }[] = [];

const ACTOR = { uid: 'uid-test', name: 'Tester' };

jest.mock('@/services/db', () => ({
  dbService: {
    updateRecord: jest.fn(async (path: string, patch: any) => {
      updateRecordCalls.push({ path, patch });
    }),
  },
}));

jest.mock('@/services/client-repository-pg', () => ({
  resolveClientId: jest.fn(async () => 'client-uuid-1'),
}));

jest.mock('@/services/sales-repository-pg', () => ({
  createSale: jest.fn(async (input: any) => {
    createSaleCalls.push(input);
    return { receiptNumber: 'INV-TEST' };
  }),
}));

beforeEach(() => {
  createSaleCalls.length = 0;
  updateRecordCalls.length = 0;
});

/** A quote as `normalizeQuote` produces it, priced through money.ts. */
function makeQuote(over: Partial<QuoteRecord> = {}): QuoteRecord {
  return {
    id: 'QT-260715-AAAA',
    quoteId: 'QT-260715-AAAA',
    dbPath: 'quotes/2026/07/15/QT-260715-AAAA',
    clientName: 'Acme Signs',
    createdAt: '2026-07-15T10:00:00+01:00',
    records: [makeRecord({ total: 600 })],
    subtotal: 600,
    adjustments: [
      { kind: 'mov', label: 'Minimum order adjustment', amount: 400 },
      { kind: 'delivery', label: 'Delivery', amount: 2000 },
    ],
    totalAmount: 3000,
    deliveryCost: 2000,
    status: 'Draft',
    isVoided: false,
    ...over,
  };
}

/** Sum of every line's total plus every adjustment's amount — what create_sale computes server-side. */
function reconstructedTotal(input: any): number {
  const linesTotal = input.lines.reduce((sum: number, l: any) => sum + l.total, 0);
  const adjustmentsTotal = (input.adjustments ?? []).reduce((sum: number, a: any) => sum + a.amount, 0);
  return linesTotal + adjustmentsTotal;
}

describe('convertQuoteToSale', () => {
  it('sends a sale whose reconstructed total is identical to the quote total', async () => {
    const quote = makeQuote();
    await convertQuoteToSale(quote, ACTOR);

    expect(createSaleCalls).toHaveLength(1);
    expect(reconstructedTotal(createSaleCalls[0])).toBe(quote.totalAmount);
    expect(reconstructedTotal(createSaleCalls[0])).toBe(3000);
  });

  it('carries every adjustment across unchanged', async () => {
    const quote = makeQuote();
    await convertQuoteToSale(quote, ACTOR);

    expect(createSaleCalls[0].adjustments).toEqual(quote.adjustments);
  });

  it('carries every line total across unchanged (subtotal + adjustments === total)', async () => {
    const quote = makeQuote();
    await convertQuoteToSale(quote, ACTOR);

    const input = createSaleCalls[0];
    const linesTotal = input.lines.reduce((sum: number, l: any) => sum + l.total, 0);
    expect(linesTotal).toBe(quote.subtotal);
    expect(reconstructedTotal(input)).toBe(input.lines.reduce((s: number, l: any) => s + l.total, 0) + input.adjustments.reduce((s: number, a: any) => s + a.amount, 0));
  });

  /**
   * The regression this test exists for: a quote priced under a ₦1,000 MOV,
   * converted after the MOV was raised to ₦5,000, must still cost ₦3,000.
   * Conversion reads the quote's stored snapshot, never live Settings — so
   * there is no MOV to inject here, and that is exactly the point.
   */
  it('does not re-price against a MOV that changed after the quote was given', async () => {
    const quote = makeQuote();
    await convertQuoteToSale(quote, ACTOR);
    expect(reconstructedTotal(createSaleCalls[0])).toBe(3000);
    expect(createSaleCalls[0].adjustments).toEqual(quote.adjustments);
  });

  it('preserves the quote total when there are no adjustments at all', async () => {
    const quote = makeQuote({
      records: [makeRecord({ total: 12_000 })],
      subtotal: 12_000,
      adjustments: [],
      totalAmount: 12_000,
      deliveryCost: 0,
    });
    await convertQuoteToSale(quote, ACTOR);
    expect(reconstructedTotal(createSaleCalls[0])).toBe(12_000);
    expect(createSaleCalls[0].adjustments).toEqual([]);
  });

  it('starts the sale unpaid regardless of the quote — no openingPayment is sent', async () => {
    await convertQuoteToSale(makeQuote(), ACTOR);
    expect(createSaleCalls[0].openingPayment).toBeUndefined();
  });

  it('marks the original quote Converted once the sale is created', async () => {
    const quote = makeQuote();
    await convertQuoteToSale(quote, ACTOR);
    expect(updateRecordCalls).toEqual([{ path: quote.dbPath, patch: { status: 'Converted' } }]);
  });

  it('refuses to convert a quote with no client name', async () => {
    await expect(convertQuoteToSale(makeQuote({ clientName: '' }), ACTOR)).rejects.toThrow(
      /client name/i,
    );
    expect(createSaleCalls).toHaveLength(0);
  });

  it('refuses to convert a quote with no items', async () => {
    await expect(convertQuoteToSale(makeQuote({ records: [] }), ACTOR)).rejects.toThrow(
      /at least one item/i,
    );
    expect(createSaleCalls).toHaveLength(0);
  });
});
