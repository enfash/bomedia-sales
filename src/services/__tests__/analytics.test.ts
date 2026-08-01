/**
 * Unit tests for src/services/analytics.ts
 *
 * Contains the ratcheted pair for audit §1.3 bug #1 ("today" computed in UTC).
 * See docs/AUDIT_2026-07.md for the Stage 1 checklist.
 *
 * The whole file assumes Africa/Lagos (UTC+1); jest.setup.ts enforces that.
 */

import {
  clientsOwing,
  collectedVsOutstanding,
  computeDashboardMetrics,
  expensesVsRevenue,
  filterBatchesByWindow,
  filterExpensesByWindow,
  productionThroughput,
  rangeToWindow,
  readyJobs,
  recentSales,
  revenueByDay,
  revenueByMaterial,
  revenueByMonth,
  topClients,
} from '@/services/analytics';
import { makeBatch, makeExpense, makeRecord } from '@/test-support/factories';
import { isToday } from '@/utils/date';

/**
 * 2026-07-15 10:00 WAT === 09:00 UTC — deliberately mid-morning so that "now"
 * itself falls on the same calendar day in both zones. That isolates the bug
 * under test to the *batch* timestamp rather than to `now`.
 */
const NOW = new Date('2026-07-15T10:00:00+01:00');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('computeDashboardMetrics', () => {
  it('returns all-zero metrics for no data', () => {
    expect(computeDashboardMetrics([], [])).toEqual({
      todaySales: 0,
      todayJobs: 0,
      todayRevenue: 0,
      mtdRevenue: 0,
      mtdExpenses: 0,
      mtdNetProfit: 0,
      grossMargin: 0,
      revenueAllTime: 0,
      collectedAllTime: 0,
      outstanding: 0,
    });
  });

  it('accumulates all-time totals across every batch regardless of date', () => {
    const metrics = computeDashboardMetrics(
      [
        makeBatch({ createdAt: '2025-01-05T10:00:00+01:00', totalAmount: 10_000, totalPaid: 4_000, totalBalance: 6_000 }),
        makeBatch({ createdAt: '2026-07-15T10:00:00+01:00', totalAmount: 50_000, totalPaid: 50_000, totalBalance: 0 }),
      ],
      [],
    );
    expect(metrics.revenueAllTime).toBe(60_000);
    expect(metrics.collectedAllTime).toBe(54_000);
    expect(metrics.outstanding).toBe(6_000);
  });

  it('counts a mid-morning sale toward today', () => {
    const metrics = computeDashboardMetrics(
      [makeBatch({ createdAt: '2026-07-15T10:00:00+01:00', totalAmount: 50_000, records: [makeRecord(), makeRecord()] })],
      [],
    );
    expect(metrics.todaySales).toBe(1);
    expect(metrics.todayJobs).toBe(2);
    expect(metrics.todayRevenue).toBe(50_000);
  });

  it('excludes a sale from a previous day', () => {
    const metrics = computeDashboardMetrics(
      [makeBatch({ createdAt: '2026-07-13T10:00:00+01:00', totalAmount: 50_000 })],
      [],
    );
    expect(metrics.todaySales).toBe(0);
    expect(metrics.todayRevenue).toBe(0);
  });

  it('sums month-to-date revenue for the current calendar month only', () => {
    const metrics = computeDashboardMetrics(
      [
        makeBatch({ createdAt: '2026-07-02T10:00:00+01:00', totalAmount: 30_000 }),
        makeBatch({ createdAt: '2026-07-15T10:00:00+01:00', totalAmount: 20_000 }),
        makeBatch({ createdAt: '2026-06-28T10:00:00+01:00', totalAmount: 99_000 }),
      ],
      [],
    );
    expect(metrics.mtdRevenue).toBe(50_000);
  });

  it('derives net profit and gross margin from revenue and expenses', () => {
    const metrics = computeDashboardMetrics(
      [makeBatch({ createdAt: '2026-07-15T10:00:00+01:00', totalAmount: 100_000 })],
      [makeExpense({ amount: 40_000 })],
    );
    expect(metrics.mtdExpenses).toBe(40_000);
    expect(metrics.mtdNetProfit).toBe(60_000);
    expect(metrics.grossMargin).toBe(60);
  });

  it('reports zero gross margin rather than dividing by zero', () => {
    const metrics = computeDashboardMetrics([], [makeExpense({ amount: 40_000 })]);
    expect(metrics.grossMargin).toBe(0);
    expect(metrics.mtdNetProfit).toBe(-40_000);
  });

  /* ------------------------------------------------------------------ *
   * AUDIT §1.3 BUG #1 — "today" is computed in UTC.
   *
   *   const todayStr = now.toISOString().split('T')[0];
   *   if (d.toISOString().split('T')[0] === todayStr) { todaySales += 1; ... }
   *
   * Lagos is UTC+1. A sale logged at 00:30 WAT is 23:30 the PREVIOUS day in
   * UTC, so it silently drops out of "Today's Sales" on the dashboard.
   *
   * With "now" pinned to 10:00 WAT (09:00 UTC), `todayStr` is '2026-07-15' in
   * both zones — so the mismatch below is caused purely by the batch's own
   * timestamp crossing the UTC date line.
   *
   * Ratchet pair — BOTH tests go red the moment the bug is fixed:
   *   A: `it.failing` asserting the CORRECT behaviour. Stage 1 flips it to `it`.
   *   B: plain `it` pinning TODAY'S WRONG values. Stage 1 deletes it.
   * ------------------------------------------------------------------ */
  describe('§1.3 bug #1 — a 00:30 WAT sale and the UTC date line', () => {
    /** 2026-07-15 00:30 WAT === 2026-07-14 23:30 UTC. */
    const EARLY_MORNING_WAT = '2026-07-15T00:30:00+01:00';

    const earlyBatch = () =>
      makeBatch({
        createdAt: EARLY_MORNING_WAT,
        totalAmount: 50_000,
        records: [makeRecord(), makeRecord()],
      });

    // A — the behaviour we want. Currently throws, so `it.failing` passes.
    // STAGE 1: flip `it.failing` -> `it`. No other edit.
    it.failing('counts a sale logged at 00:30 WAT toward today', () => {
      const metrics = computeDashboardMetrics([earlyBatch()], []);
      expect(metrics.todaySales).toBe(1);
      expect(metrics.todayJobs).toBe(2);
      expect(metrics.todayRevenue).toBe(50_000);
    });

    // B — the behaviour we have. Currently passes.
    // STAGE 1: delete this test.
    it('current behaviour: a 00:30 WAT sale is dropped from today entirely', () => {
      const metrics = computeDashboardMetrics([earlyBatch()], []);
      expect(metrics.todaySales).toBe(0);
      expect(metrics.todayJobs).toBe(0);
      expect(metrics.todayRevenue).toBe(0);
    });

    // Survives Stage 1. This is the heart of §1.3: `utils/date.ts:isToday`
    // uses local components and gets the SAME batch right, so the app holds two
    // contradictory definitions of "today" at once.
    it('utils/date.ts:isToday already treats the same batch as today', () => {
      expect(isToday(EARLY_MORNING_WAT)).toBe(true);
    });

    // Survives Stage 1: month-to-date uses local components and is unaffected,
    // which is why the bug shows up only on the "today" tiles.
    it('the same batch is still counted in month-to-date revenue', () => {
      const metrics = computeDashboardMetrics([earlyBatch()], []);
      expect(metrics.mtdRevenue).toBe(50_000);
    });
  });
});

describe('revenueByMonth', () => {
  it('returns one point per month, oldest first, with the last flagged current', () => {
    const points = revenueByMonth([], 3, NOW);
    expect(points.map((p) => p.key)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(points.map((p) => p.isCurrent)).toEqual([false, false, true]);
    expect(points.map((p) => p.label)).toEqual(['May', 'Jun', 'Jul']);
  });

  it('buckets revenue into the matching month', () => {
    const points = revenueByMonth(
      [
        makeBatch({ createdAt: '2026-06-10T10:00:00+01:00', totalAmount: 10_000 }),
        makeBatch({ createdAt: '2026-06-20T10:00:00+01:00', totalAmount: 5_000 }),
        makeBatch({ createdAt: '2026-07-01T10:00:00+01:00', totalAmount: 7_000 }),
      ],
      3,
      NOW,
    );
    expect(points.find((p) => p.key === '2026-06')?.value).toBe(15_000);
    expect(points.find((p) => p.key === '2026-07')?.value).toBe(7_000);
  });

  it('ignores batches outside the window', () => {
    const points = revenueByMonth([makeBatch({ createdAt: '2025-01-01T10:00:00+01:00', totalAmount: 99_000 })], 3, NOW);
    expect(points.reduce((s, p) => s + p.value, 0)).toBe(0);
  });

  it('anchors the window to endRef rather than now', () => {
    const points = revenueByMonth([], 2, new Date('2026-03-10T10:00:00+01:00'));
    expect(points.map((p) => p.key)).toEqual(['2026-02', '2026-03']);
  });

  it('crosses a year boundary correctly', () => {
    const points = revenueByMonth([], 3, new Date('2026-01-10T10:00:00+01:00'));
    expect(points.map((p) => p.key)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('revenueByDay', () => {
  it('returns one point per day ending today', () => {
    const points = revenueByDay([], 3);
    expect(points.map((p) => p.key)).toEqual(['2026-07-13', '2026-07-14', '2026-07-15']);
    expect(points.map((p) => p.isToday)).toEqual([false, false, true]);
  });

  it('buckets revenue into the matching local day', () => {
    const points = revenueByDay(
      [
        makeBatch({ createdAt: '2026-07-14T10:00:00+01:00', totalAmount: 8_000 }),
        makeBatch({ createdAt: '2026-07-15T10:00:00+01:00', totalAmount: 3_000 }),
      ],
      3,
    );
    expect(points.find((p) => p.key === '2026-07-14')?.value).toBe(8_000);
    expect(points.find((p) => p.key === '2026-07-15')?.value).toBe(3_000);
  });

  it('uses local date components, so a 00:30 WAT sale lands on today', () => {
    // Contrast with computeDashboardMetrics above: revenueByDay uses dayKey(),
    // which reads local components and is therefore already correct.
    const points = revenueByDay([makeBatch({ createdAt: '2026-07-15T00:30:00+01:00', totalAmount: 4_000 })], 3);
    expect(points.find((p) => p.isToday)?.value).toBe(4_000);
  });
});

describe('readyJobs', () => {
  it('returns only batches in the Ready stage', () => {
    const ready = makeBatch({ id: 'a', productionStage: 'Ready' });
    const result = readyJobs([ready, makeBatch({ id: 'b', productionStage: 'Printing' })]);
    expect(result).toEqual([ready]);
  });

  it('returns an empty array when nothing is ready', () => {
    expect(readyJobs([makeBatch({ productionStage: 'Queued' })])).toEqual([]);
  });
});

describe('clientsOwing', () => {
  it('groups balances by client, largest first', () => {
    const result = clientsOwing([
      makeBatch({ clientName: 'Acme', totalBalance: 1_000 }),
      makeBatch({ clientName: 'Beta', totalBalance: 5_000 }),
      makeBatch({ clientName: 'Acme', totalBalance: 2_000 }),
    ]);
    expect(result).toEqual([
      { clientName: 'Beta', balance: 5_000 },
      { clientName: 'Acme', balance: 3_000 },
    ]);
  });

  it('excludes clients with no outstanding balance', () => {
    expect(clientsOwing([makeBatch({ clientName: 'Acme', totalBalance: 0 })])).toEqual([]);
  });

  it('trims client names and falls back to Unknown Client', () => {
    const result = clientsOwing([
      makeBatch({ clientName: '  Acme  ', totalBalance: 1_000 }),
      makeBatch({ clientName: '   ', totalBalance: 2_000 }),
    ]);
    expect(result).toEqual([
      { clientName: 'Unknown Client', balance: 2_000 },
      { clientName: 'Acme', balance: 1_000 },
    ]);
  });
});

describe('recentSales', () => {
  it('takes the first n batches, preserving order', () => {
    const batches = [makeBatch({ id: 'a' }), makeBatch({ id: 'b' }), makeBatch({ id: 'c' })];
    expect(recentSales(batches, 2).map((b) => b.id)).toEqual(['a', 'b']);
  });

  it('returns everything when there are fewer than n', () => {
    expect(recentSales([makeBatch()], 8)).toHaveLength(1);
  });
});

describe('revenueByMaterial', () => {
  it('groups line-item revenue by material, largest first', () => {
    const result = revenueByMaterial([
      makeBatch({ records: [makeRecord({ material: 'Vinyl', total: 3_000 }), makeRecord({ material: 'SAV', total: 9_000 })] }),
      makeBatch({ records: [makeRecord({ material: 'Vinyl', total: 2_000 })] }),
    ]);
    expect(result).toEqual([
      { material: 'SAV', revenue: 9_000, jobs: 1 },
      { material: 'Vinyl', revenue: 5_000, jobs: 2 },
    ]);
  });

  it('labels blank materials as Unspecified', () => {
    const result = revenueByMaterial([makeBatch({ records: [makeRecord({ material: '  ', total: 1_000 })] })]);
    expect(result[0].material).toBe('Unspecified');
  });

  it('folds everything past topN into a single Other bucket', () => {
    const records = ['a', 'b', 'c', 'd'].map((m, i) => makeRecord({ material: m, total: (4 - i) * 1_000 }));
    const result = revenueByMaterial([makeBatch({ records })], 2);
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ material: 'Other (2)', revenue: 3_000, jobs: 2 });
  });

  it('does not add an Other bucket when the list fits within topN', () => {
    const result = revenueByMaterial([makeBatch({ records: [makeRecord({ material: 'Vinyl' })] })], 6);
    expect(result.some((r) => r.material.startsWith('Other'))).toBe(false);
  });
});

describe('productionThroughput', () => {
  it('returns all five stages in pipeline order even when empty', () => {
    expect(productionThroughput([]).map((s) => s.stage)).toEqual([
      'Queued',
      'Printing',
      'Finishing',
      'Ready',
      'Delivered',
    ]);
  });

  it('counts jobs and sums order value per stage', () => {
    const result = productionThroughput([
      makeBatch({ productionStage: 'Printing', totalAmount: 10_000 }),
      makeBatch({ productionStage: 'Printing', totalAmount: 5_000 }),
      makeBatch({ productionStage: 'Ready', totalAmount: 2_000 }),
    ]);
    expect(result.find((s) => s.stage === 'Printing')).toEqual({ stage: 'Printing', count: 2, value: 15_000 });
    expect(result.find((s) => s.stage === 'Ready')).toEqual({ stage: 'Ready', count: 1, value: 2_000 });
  });

  it('files an unrecognised stage under Queued', () => {
    const rogue = makeBatch({ totalAmount: 1_000 });
    // Deliberately bypass the type to simulate a bad value from storage.
    (rogue as { productionStage: string }).productionStage = 'Nonsense';
    const result = productionThroughput([rogue]);
    expect(result.find((s) => s.stage === 'Queued')).toEqual({ stage: 'Queued', count: 1, value: 1_000 });
  });
});

describe('expensesVsRevenue', () => {
  it('pairs revenue and expenses per month and derives net', () => {
    const result = expensesVsRevenue(
      [makeBatch({ createdAt: '2026-07-05T10:00:00+01:00', totalAmount: 100_000 })],
      [makeExpense({ createdAt: '2026-07-06T10:00:00+01:00', amount: 30_000 })],
      2,
      NOW,
    );
    const july = result.find((p) => p.key === '2026-07');
    expect(july).toEqual({ key: '2026-07', label: 'Jul', revenue: 100_000, expenses: 30_000, net: 70_000 });
  });

  it('produces a negative net when expenses exceed revenue', () => {
    const result = expensesVsRevenue([], [makeExpense({ createdAt: '2026-07-06T10:00:00+01:00', amount: 30_000 })], 1, NOW);
    expect(result[0].net).toBe(-30_000);
  });

  it('ignores data outside the window', () => {
    const result = expensesVsRevenue(
      [makeBatch({ createdAt: '2024-01-01T10:00:00+01:00', totalAmount: 99_000 })],
      [makeExpense({ createdAt: '2024-01-01T10:00:00+01:00', amount: 99_000 })],
      2,
      NOW,
    );
    expect(result.every((p) => p.revenue === 0 && p.expenses === 0)).toBe(true);
  });
});

describe('topClients', () => {
  it('ranks clients by billed revenue and carries their balance', () => {
    const result = topClients([
      makeBatch({ clientName: 'Acme', totalAmount: 10_000, totalBalance: 1_000 }),
      makeBatch({ clientName: 'Acme', totalAmount: 5_000, totalBalance: 500 }),
      makeBatch({ clientName: 'Beta', totalAmount: 20_000, totalBalance: 0 }),
    ]);
    expect(result).toEqual([
      { clientName: 'Beta', revenue: 20_000, balance: 0 },
      { clientName: 'Acme', revenue: 15_000, balance: 1_500 },
    ]);
  });

  it('limits the list to n', () => {
    const batches = ['a', 'b', 'c'].map((n, i) => makeBatch({ clientName: n, totalAmount: (3 - i) * 1_000 }));
    expect(topClients(batches, 2)).toHaveLength(2);
  });
});

describe('collectedVsOutstanding', () => {
  it('splits collected against outstanding and derives a percentage', () => {
    expect(
      collectedVsOutstanding([
        makeBatch({ totalPaid: 75_000, totalBalance: 25_000 }),
      ]),
    ).toEqual({ collected: 75_000, outstanding: 25_000, total: 100_000, collectedPct: 75 });
  });

  it('reports zero percent rather than dividing by zero', () => {
    expect(collectedVsOutstanding([])).toEqual({ collected: 0, outstanding: 0, total: 0, collectedPct: 0 });
  });
});

describe('rangeToWindow', () => {
  it('anchors "today" to local midnight', () => {
    const win = rangeToWindow('today');
    expect(new Date(win.start).toISOString()).toBe('2026-07-14T23:00:00.000Z'); // 00:00 WAT
    expect(win.end).toBe(NOW.getTime());
    expect(win.months).toBe(1);
    expect(win.label).toBe('Today');
  });

  it.each<[string, number, string]>([
    ['1m', 1, 'Last month'],
    ['3m', 3, 'Last 3 months'],
    ['6m', 6, 'Last 6 months'],
    ['12m', 12, 'Last 12 months'],
  ])('resolves the %s preset', (preset, months, label) => {
    const win = rangeToWindow(preset as '1m' | '3m' | '6m' | '12m');
    expect(win.months).toBe(months);
    expect(win.label).toBe(label);
    expect(win.end).toBe(NOW.getTime());
  });

  it('starts a multi-month preset on the first of the earliest month', () => {
    const win = rangeToWindow('3m');
    expect(new Date(win.start).toISOString()).toBe('2026-04-30T23:00:00.000Z'); // 2026-05-01 00:00 WAT
  });

  it('resolves a custom range across its full local days', () => {
    const win = rangeToWindow('custom', '2026-06-10', '2026-07-20');
    expect(new Date(win.start).toISOString()).toBe('2026-06-09T23:00:00.000Z'); // 00:00:00 WAT
    expect(new Date(win.end).toISOString()).toBe('2026-07-20T22:59:59.000Z'); // 23:59:59 WAT
    expect(win.months).toBe(2);
    expect(win.label).toBe('Custom range');
  });

  it('defaults a custom range to the start of this month through now', () => {
    const win = rangeToWindow('custom');
    expect(new Date(win.start).toISOString()).toBe('2026-06-30T23:00:00.000Z'); // 2026-07-01 00:00 WAT
    expect(win.end).toBe(NOW.getTime());
  });
});

describe('filterBatchesByWindow', () => {
  const win = rangeToWindow('custom', '2026-07-10', '2026-07-20');

  it('keeps batches inside the window', () => {
    const inside = makeBatch({ createdAt: '2026-07-15T10:00:00+01:00' });
    expect(filterBatchesByWindow([inside], win)).toEqual([inside]);
  });

  it('drops batches on either side of the window', () => {
    expect(
      filterBatchesByWindow(
        [
          makeBatch({ createdAt: '2026-07-09T10:00:00+01:00' }),
          makeBatch({ createdAt: '2026-07-21T10:00:00+01:00' }),
        ],
        win,
      ),
    ).toEqual([]);
  });

  it('includes batches exactly on the boundaries', () => {
    const result = filterBatchesByWindow(
      [
        makeBatch({ id: 'start', createdAt: new Date(win.start).toISOString() }),
        makeBatch({ id: 'end', createdAt: new Date(win.end).toISOString() }),
      ],
      win,
    );
    expect(result.map((b) => b.id)).toEqual(['start', 'end']);
  });
});

describe('filterExpensesByWindow', () => {
  const win = rangeToWindow('custom', '2026-07-10', '2026-07-20');

  it('keeps expenses inside the window and drops the rest', () => {
    const inside = makeExpense({ id: 'in', createdAt: '2026-07-15T10:00:00+01:00' });
    const outside = makeExpense({ id: 'out', createdAt: '2026-08-01T10:00:00+01:00' });
    expect(filterExpensesByWindow([inside, outside], win)).toEqual([inside]);
  });
});
