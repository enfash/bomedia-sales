/**
 * Pure aggregation selectors for the dashboard/analytics surfaces. No I/O — feed
 * them the data from the repositories/hooks. Kept framework-free so they can be
 * unit-tested and reused by both web dashboard widgets and mobile.
 */

import { PRODUCTION_STAGES, type ProductionStage, type SalesBatch } from '@/components/records/types';
import type { ExpenseRecord } from '@/hooks/use-expenses';
import { isSameLocalDay, parseDate } from '@/utils/date';

export interface DashboardMetrics {
  todaySales: number;
  todayJobs: number;
  todayRevenue: number;
  mtdRevenue: number;
  mtdExpenses: number;
  mtdNetProfit: number;
  grossMargin: number;
  revenueAllTime: number;
  collectedAllTime: number;
  outstanding: number;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Voided sales are excluded from EVERY figure in this file.
 *
 * A voided sale is a cancelled job. It was never revenue, nothing is owed on
 * it, and it should not appear on the board. Filtering here rather than only in
 * `useRecords` is deliberate belt-and-braces: these are pure functions, so the
 * exclusion is testable directly, and a future caller that reaches a selector
 * without going through the hook still gets the right answer.
 *
 * NOTE this says nothing about money already collected against a voided sale.
 * That cash was really taken and stays in the payment ledger — see the Daily
 * Cash view. Voiding cancels the job, it does not refund the customer.
 */
export function liveBatches(batches: SalesBatch[]): SalesBatch[] {
  return batches.filter((b) => !b.isVoided);
}

export function computeDashboardMetrics(
  batches: SalesBatch[],
  expenses: ExpenseRecord[],
): DashboardMetrics {
  const now = new Date();
  const thisMonth = monthKey(now);

  let todaySales = 0;
  let todayJobs = 0;
  let todayRevenue = 0;
  let mtdRevenue = 0;
  let revenueAllTime = 0;
  let collectedAllTime = 0;
  let outstanding = 0;

  for (const b of liveBatches(batches)) {
    const d = parseDate(b.createdAt);
    revenueAllTime += b.totalAmount || 0;
    collectedAllTime += b.totalPaid || 0;
    outstanding += b.totalBalance || 0;

    // Local calendar day, not UTC. A sale at 00:30 WAT is still today.
    if (isSameLocalDay(d, now)) {
      todaySales += 1;
      todayJobs += b.records.length;
      todayRevenue += b.totalAmount || 0;
    }
    if (monthKey(d) === thisMonth) {
      mtdRevenue += b.totalAmount || 0;
    }
  }

  const mtdExpenses = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const mtdNetProfit = mtdRevenue - mtdExpenses;
  const grossMargin = mtdRevenue > 0 ? (mtdNetProfit / mtdRevenue) * 100 : 0;

  return {
    todaySales,
    todayJobs,
    todayRevenue,
    mtdRevenue,
    mtdExpenses,
    mtdNetProfit,
    grossMargin,
    revenueAllTime,
    collectedAllTime,
    outstanding,
  };
}

export interface MonthPoint {
  key: string;
  label: string;
  value: number;
  isCurrent: boolean;
}

/**
 * Revenue bucketed by calendar month for the `monthsBack` months ending at
 * `endRef` (inclusive). `endRef` lets a custom range anchor the chart to a past
 * month instead of always ending at "now".
 */
export function revenueByMonth(batches: SalesBatch[], monthsBack = 6, endRef: Date = new Date()): MonthPoint[] {
  batches = liveBatches(batches);
  const points: MonthPoint[] = [];
  const index: Record<string, number> = {};

  for (let i = monthsBack - 1; i >= 0; i--) {
    const dt = new Date(endRef.getFullYear(), endRef.getMonth() - i, 1);
    const key = monthKey(dt);
    points.push({
      key,
      label: dt.toLocaleDateString('en-US', { month: 'short' }),
      value: 0,
      isCurrent: i === 0,
    });
    index[key] = points.length - 1;
  }

  for (const b of batches) {
    const key = monthKey(parseDate(b.createdAt));
    if (key in index) points[index[key]].value += b.totalAmount || 0;
  }

  return points;
}

export interface DayPoint {
  key: string;
  label: string;
  value: number;
  isToday: boolean;
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Revenue per calendar day for the last `days` days (incl. today), oldest → newest. */
export function revenueByDay(batches: SalesBatch[], days = 7): DayPoint[] {
  batches = liveBatches(batches);
  const now = new Date();
  const points: DayPoint[] = [];
  const index: Record<string, number> = {};
  for (let i = days - 1; i >= 0; i--) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const key = dayKey(dt);
    points.push({ key, label: dt.toLocaleDateString('en-US', { weekday: 'short' }), value: 0, isToday: i === 0 });
    index[key] = points.length - 1;
  }
  for (const b of batches) {
    const key = dayKey(parseDate(b.createdAt));
    if (key in index) points[index[key]].value += b.totalAmount || 0;
  }
  return points;
}

/** Jobs finished on the machine, awaiting pickup/dispatch. */
export function readyJobs(batches: SalesBatch[]): SalesBatch[] {
  batches = liveBatches(batches);
  return batches.filter((b) => b.productionStage === 'Ready');
}

export interface ClientOwing {
  clientName: string;
  balance: number;
}

/** Distinct clients with an outstanding balance, largest first. */
export function clientsOwing(batches: SalesBatch[]): ClientOwing[] {
  batches = liveBatches(batches);
  const map: Record<string, number> = {};
  for (const b of batches) {
    if ((b.totalBalance || 0) > 0) {
      const name = b.clientName?.trim() || 'Unknown Client';
      map[name] = (map[name] || 0) + b.totalBalance;
    }
  }
  return Object.entries(map)
    .map(([clientName, balance]) => ({ clientName, balance }))
    .sort((a, b) => b.balance - a.balance);
}

/** Most recent sales (batches arrive already sorted newest-first). */
export function recentSales(batches: SalesBatch[], n = 8): SalesBatch[] {
  batches = liveBatches(batches);
  return batches.slice(0, n);
}

/* ------------------------------------------------------------------ *
 * Analytics-page selectors (Phase 3). All pure — feed them repository data.
 * ------------------------------------------------------------------ */

export interface MaterialRevenue {
  material: string;
  revenue: number;
  jobs: number;
}

/**
 * Revenue grouped by material across every line item, largest first. Anything
 * beyond `topN` is folded into a single "Other" bucket so the chart stays legible.
 */
export function revenueByMaterial(batches: SalesBatch[], topN = 6): MaterialRevenue[] {
  batches = liveBatches(batches);
  const map: Record<string, { revenue: number; jobs: number }> = {};
  for (const b of batches) {
    for (const r of b.records) {
      const key = r.material?.trim() || 'Unspecified';
      if (!map[key]) map[key] = { revenue: 0, jobs: 0 };
      map[key].revenue += r.total || 0;
      map[key].jobs += 1;
    }
  }
  const arr = Object.entries(map)
    .map(([material, v]) => ({ material, revenue: v.revenue, jobs: v.jobs }))
    .sort((a, b) => b.revenue - a.revenue);

  if (arr.length <= topN) return arr;
  const top = arr.slice(0, topN);
  const rest = arr.slice(topN);
  const other = rest.reduce(
    (acc, x) => ({ revenue: acc.revenue + x.revenue, jobs: acc.jobs + x.jobs }),
    { revenue: 0, jobs: 0 },
  );
  top.push({ material: `Other (${rest.length})`, revenue: other.revenue, jobs: other.jobs });
  return top;
}

export interface StageThroughput {
  stage: ProductionStage;
  count: number;
  value: number;
}

/** Job count + order value sitting in each production stage (all stages, in order). */
export function productionThroughput(batches: SalesBatch[]): StageThroughput[] {
  batches = liveBatches(batches);
  const base: Record<ProductionStage, { count: number; value: number }> = {
    Queued: { count: 0, value: 0 },
    Printing: { count: 0, value: 0 },
    Finishing: { count: 0, value: 0 },
    Ready: { count: 0, value: 0 },
    Delivered: { count: 0, value: 0 },
  };
  for (const b of batches) {
    const stage = base[b.productionStage] ? b.productionStage : 'Queued';
    base[stage].count += 1;
    base[stage].value += b.totalAmount || 0;
  }
  return PRODUCTION_STAGES.map((stage) => ({ stage, count: base[stage].count, value: base[stage].value }));
}

export interface MonthMoney {
  key: string;
  label: string;
  revenue: number;
  expenses: number;
  net: number;
}

/** Revenue vs expenses per calendar month for the `monthsBack` months ending at `endRef`. */
export function expensesVsRevenue(
  batches: SalesBatch[],
  expenses: ExpenseRecord[],
  monthsBack = 6,
  endRef: Date = new Date(),
): MonthMoney[] {
  const points: MonthMoney[] = [];
  const index: Record<string, number> = {};

  for (let i = monthsBack - 1; i >= 0; i--) {
    const dt = new Date(endRef.getFullYear(), endRef.getMonth() - i, 1);
    const key = monthKey(dt);
    points.push({ key, label: dt.toLocaleDateString('en-US', { month: 'short' }), revenue: 0, expenses: 0, net: 0 });
    index[key] = points.length - 1;
  }

  for (const b of batches) {
    const key = monthKey(parseDate(b.createdAt));
    if (key in index) points[index[key]].revenue += b.totalAmount || 0;
  }
  for (const e of expenses) {
    const key = monthKey(parseDate(e.createdAt));
    if (key in index) points[index[key]].expenses += e.amount || 0;
  }
  for (const p of points) p.net = p.revenue - p.expenses;

  return points;
}

export interface TopClient {
  clientName: string;
  revenue: number;
  balance: number;
}

/** Clients ranked by total billed revenue, largest first. */
export interface ClientAgg {
  clientName: string;
  totalSpend: number;
  totalPaid: number;
  balance: number;
  lastPurchaseDate: number;
  jobsCount: number;
}

/**
 * Per-client totals across every sale.
 *
 * Extracted from `clients.tsx` and `clients.web.tsx`, which each carried their
 * own copy of this reduce. Two implementations of one money calculation is the
 * same latent bug class the money.ts extraction removed in Stage 1 — they had
 * already drifted on sort order, and nothing stopped them drifting on the
 * arithmetic next.
 *
 * Returned sorted by spend, descending. The web table re-sorts by its own
 * column anyway; native relies on this order.
 */
export function aggregateClients(batches: SalesBatch[]): ClientAgg[] {
  const map: Record<string, ClientAgg> = {};

  for (const batch of liveBatches(batches)) {
    const name = batch.clientName?.trim() || 'Unknown Client';
    if (!map[name]) {
      map[name] = {
        clientName: name,
        totalSpend: 0,
        totalPaid: 0,
        balance: 0,
        lastPurchaseDate: 0,
        jobsCount: 0,
      };
    }
    map[name].totalSpend += batch.totalAmount || 0;
    map[name].totalPaid += batch.totalPaid || 0;
    map[name].jobsCount += batch.records.length;

    // An empty or unparseable createdAt yields NaN, which would poison the
    // comparison and leave lastPurchaseDate at 0 forever.
    const t = new Date(batch.createdAt).getTime();
    if (Number.isFinite(t) && t > map[name].lastPurchaseDate) {
      map[name].lastPurchaseDate = t;
    }
  }

  for (const c of Object.values(map)) c.balance = c.totalSpend - c.totalPaid;

  return Object.values(map).sort((a, b) => b.totalSpend - a.totalSpend);
}

export function topClients(batches: SalesBatch[], n = 6): TopClient[] {
  batches = liveBatches(batches);
  const map: Record<string, { revenue: number; balance: number }> = {};
  for (const b of batches) {
    const name = b.clientName?.trim() || 'Unknown Client';
    if (!map[name]) map[name] = { revenue: 0, balance: 0 };
    map[name].revenue += b.totalAmount || 0;
    map[name].balance += b.totalBalance || 0;
  }
  return Object.entries(map)
    .map(([clientName, v]) => ({ clientName, revenue: v.revenue, balance: v.balance }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, n);
}

export interface CollectedSplit {
  collected: number;
  outstanding: number;
  total: number;
  collectedPct: number;
}

/** How much of all billed revenue has been collected vs is still outstanding. */
export function collectedVsOutstanding(batches: SalesBatch[]): CollectedSplit {
  batches = liveBatches(batches);
  let collected = 0;
  let outstanding = 0;
  for (const b of batches) {
    collected += b.totalPaid || 0;
    outstanding += b.totalBalance || 0;
  }
  const total = collected + outstanding;
  return { collected, outstanding, total, collectedPct: total > 0 ? (collected / total) * 100 : 0 };
}

/* ------------------------------------------------------------------ *
 * Date-range control (web dashboard + Analytics). Mobile stays fixed to "today".
 * ------------------------------------------------------------------ */

export type RangePreset = 'today' | '1m' | '3m' | '6m' | '12m' | 'custom';

export interface DateWindow {
  /** Inclusive [start, end] epoch ms for filtering batches/expenses. */
  start: number;
  end: number;
  /** Month buckets for the time-series charts. */
  months: number;
  /** Anchor month for the charts (end of the window). */
  endRef: Date;
  label: string;
}

/** Resolve a preset (or a custom start/end `YYYY-MM-DD`) into a concrete window. */
export function rangeToWindow(preset: RangePreset, customStart?: string, customEnd?: string): DateWindow {
  const now = new Date();
  const end = now.getTime();

  if (preset === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return { start, end, months: 1, endRef: now, label: 'Today' };
  }

  if (preset === 'custom') {
    const startDate = customStart ? new Date(`${customStart}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = customEnd ? new Date(`${customEnd}T23:59:59`) : now;
    const months = Math.max(
      1,
      (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1,
    );
    return { start: startDate.getTime(), end: endDate.getTime(), months, endRef: endDate, label: 'Custom range' };
  }

  const monthsMap: Record<string, number> = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 };
  const m = monthsMap[preset];
  const start = new Date(now.getFullYear(), now.getMonth() - (m - 1), 1).getTime();
  return { start, end, months: m, endRef: now, label: m === 1 ? 'Last month' : `Last ${m} months` };
}

/** Filter batches to a window by their createdAt. */
export function filterBatchesByWindow(batches: SalesBatch[], win: DateWindow): SalesBatch[] {
  batches = liveBatches(batches);
  return batches.filter((b) => {
    const t = parseDate(b.createdAt).getTime();
    return t >= win.start && t <= win.end;
  });
}

/** Filter expenses to a window by their createdAt. */
export function filterExpensesByWindow(expenses: ExpenseRecord[], win: DateWindow): ExpenseRecord[] {
  return expenses.filter((e) => {
    const t = parseDate(e.createdAt).getTime();
    return t >= win.start && t <= win.end;
  });
}
