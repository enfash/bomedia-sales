/**
 * Quote → sale conversion must not re-price.
 *
 * The customer accepted a total. Converting the quote into a sale has to carry
 * that exact figure across: recomputing it against today's MOV would quietly
 * hand them a different number than the one they agreed to.
 */

import type { QuoteRecord, StoredBatch } from '@/components/records/types';
import { convertQuoteToSale } from '@/services/quote-repository';
import { makeRecord } from '@/test-support/factories';

/** Captures whatever createBatch persists so we can assert on the written node. */
const written: { path: string; node: StoredBatch }[] = [];

const ACTOR = { uid: 'uid-test', name: 'Tester' };

jest.mock('@/services/db', () => ({
  dbService: {
    setRecord: jest.fn(async (path: string, node: any) => {
      written.push({ path, node });
    }),
    updateRecord: jest.fn(async () => {}),
  },
}));

beforeEach(() => {
  written.length = 0;
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
    ...over,
  };
}

describe('convertQuoteToSale', () => {
  it('writes a sale whose total is identical to the quote total', async () => {
    const quote = makeQuote();
    await convertQuoteToSale(quote, ACTOR);

    expect(written).toHaveLength(1);
    expect(written[0].node.totalAmount).toBe(quote.totalAmount);
    expect(written[0].node.totalAmount).toBe(3000);
  });

  it('carries the subtotal and every adjustment across unchanged', async () => {
    const quote = makeQuote();
    await convertQuoteToSale(quote, ACTOR);

    const node = written[0].node;
    expect(node.subtotal).toBe(quote.subtotal);
    expect(node.adjustments).toEqual(quote.adjustments);
  });

  it('keeps the sale internally consistent: subtotal + adjustments === total', async () => {
    await convertQuoteToSale(makeQuote(), ACTOR);

    const node = written[0].node;
    const summed = (node.adjustments ?? []).reduce((sum, a) => sum + a.amount, node.subtotal ?? 0);
    expect(summed).toBe(node.totalAmount);
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
    expect(written[0].node.totalAmount).toBe(3000);
    expect(written[0].node.adjustments).toEqual(quote.adjustments);
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
    expect(written[0].node.totalAmount).toBe(12_000);
    expect(written[0].node.subtotal).toBe(12_000);
  });

  it('starts the sale unpaid regardless of the quote', async () => {
    await convertQuoteToSale(makeQuote(), ACTOR);
    expect(written[0].node.totalPaid).toBe(0);
  });

  it('refuses to convert a quote with no client name', async () => {
    await expect(convertQuoteToSale(makeQuote({ clientName: '' }), ACTOR)).rejects.toThrow(
      /client name/i,
    );
    expect(written).toHaveLength(0);
  });

  it('refuses to convert a quote with no items', async () => {
    await expect(convertQuoteToSale(makeQuote({ records: [] }), ACTOR)).rejects.toThrow(
      /at least one item/i,
    );
    expect(written).toHaveLength(0);
  });
});
