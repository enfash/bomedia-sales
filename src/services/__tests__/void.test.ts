/**
 * Voided sales must vanish from every figure, stay findable, and never be
 * erasable.
 */

import {
  aggregateClients,
  collectedVsOutstanding,
  computeDashboardMetrics,
  liveBatches,
  productionThroughput,
  readyJobs,
  revenueByMonth,
  topClients,
} from '@/services/analytics';
import * as salesRepo from '@/services/sales-repository';
import * as quoteRepo from '@/services/quote-repository';
import { makeBatch } from '@/test-support/factories';

jest.mock('@/services/db', () => ({ dbService: {} }));

const live = (over = {}) =>
  makeBatch({ id: 'LIVE', dbPath: 'sales/2026/08/01/LIVE', totalAmount: 10_000, totalPaid: 4_000, totalBalance: 6_000, ...over });

const voided = (over = {}) =>
  makeBatch({
    id: 'VOID',
    dbPath: 'sales/2026/08/01/VOID',
    totalAmount: 999_000,
    totalPaid: 500_000,
    totalBalance: 499_000,
    isVoided: true,
    voidReason: 'customer cancelled',
    ...over,
  });

describe('liveBatches', () => {
  it('drops voided batches and keeps the rest', () => {
    expect(liveBatches([live(), voided()]).map((b) => b.id)).toEqual(['LIVE']);
  });

  it('is a no-op when nothing is voided', () => {
    const batches = [live(), live({ id: 'B' })];
    expect(liveBatches(batches)).toHaveLength(2);
  });
});

describe('voided sales are excluded from every total', () => {
  it('computeDashboardMetrics ignores them entirely', () => {
    const withVoid = computeDashboardMetrics([live(), voided()], []);
    const without = computeDashboardMetrics([live()], []);
    expect(withVoid).toEqual(without);
  });

  it('a voided sale does not inflate revenue', () => {
    const m = computeDashboardMetrics([live(), voided()], []);
    expect(m.revenueAllTime).toBe(10_000);
    expect(m.revenueAllTime).not.toBe(1_009_000);
  });

  // The one that would hurt most: chasing a customer for a cancelled job.
  it('outstanding excludes the balance on a voided sale', () => {
    const m = computeDashboardMetrics([live(), voided()], []);
    expect(m.outstanding).toBe(6_000);

    const split = collectedVsOutstanding([live(), voided()]);
    expect(split.outstanding).toBe(6_000);
  });

  it('client aggregation excludes them', () => {
    const clients = aggregateClients([
      live({ clientName: 'Acme' }),
      voided({ clientName: 'Acme' }),
    ]);
    expect(clients).toHaveLength(1);
    expect(clients[0].totalSpend).toBe(10_000);
    expect(clients[0].balance).toBe(6_000);
  });

  it('a client whose only sale was voided disappears from the list', () => {
    expect(aggregateClients([voided({ clientName: 'Ghost' })])).toEqual([]);
  });

  it('topClients excludes them', () => {
    const top = topClients([live({ clientName: 'Small' }), voided({ clientName: 'Huge' })]);
    expect(top.map((t) => t.clientName)).toEqual(['Small']);
  });

  it('revenueByMonth excludes them', () => {
    const withVoid = revenueByMonth([live(), voided()]);
    const without = revenueByMonth([live()]);
    expect(withVoid).toEqual(without);
  });

  it('the production board excludes them', () => {
    const jobs = readyJobs([
      live({ productionStage: 'Ready' }),
      voided({ productionStage: 'Ready' }),
    ]);
    expect(jobs.map((j) => j.id)).toEqual(['LIVE']);
  });

  it('productionThroughput excludes them', () => {
    const withVoid = productionThroughput([live(), voided()]);
    const without = productionThroughput([live()]);
    expect(withVoid).toEqual(without);
  });
});

/* ------------------------------------------------------------------ *
 * NO HARD DELETE — the exports must not exist.
 * ------------------------------------------------------------------ */
describe('hard delete cannot be reintroduced by import', () => {
  it('sales-repository exports no deleteBatch', () => {
    expect('deleteBatch' in salesRepo).toBe(false);
    expect((salesRepo as Record<string, unknown>).deleteBatch).toBeUndefined();
  });

  it('quote-repository exports no deleteQuote', () => {
    expect('deleteQuote' in quoteRepo).toBe(false);
    expect((quoteRepo as Record<string, unknown>).deleteQuote).toBeUndefined();
  });

  it('exports voidBatch and voidQuote instead', () => {
    expect(typeof salesRepo.voidBatch).toBe('function');
    expect(typeof quoteRepo.voidQuote).toBe('function');
  });
});

describe('voidBatch', () => {
  const actor = { uid: 'uid-admin', name: 'Elijah' };

  it('refuses an empty reason', async () => {
    await expect(salesRepo.voidBatch({ dbPath: 'sales/x' }, '   ', actor)).rejects.toThrow(/reason/i);
  });

  it('refuses an empty reason on quotes too', async () => {
    await expect(quoteRepo.voidQuote({ dbPath: 'quotes/x' }, '', actor)).rejects.toThrow(/reason/i);
  });
});
