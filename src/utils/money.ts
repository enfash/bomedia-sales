/**
 * The one place money arithmetic lives.
 *
 * Before this module, the line total was computed inline in
 * `components/sales/job-detail-card.tsx` and the batch total in
 * `app/(tabs)/new-sales.tsx` — two components, two copies, neither testable.
 *
 * THE ROUNDING POLICY (see docs/AUDIT_2026-07.md):
 *   1. Each line total is rounded to whole naira at write time.
 *   2. subtotal    = sum of the rounded line totals.
 *      totalAmount = subtotal + rounded adjustments.
 *   3. Neither subtotal nor totalAmount is ever rounded independently.
 *   4. Payment amounts are rounded with the same helpers (Stage 2).
 *
 * With that in place `formatCurrency`'s rounding is a no-op safety net rather
 * than the thing papering over float drift, and the invoice always adds up.
 */

import type { BatchAdjustment, JobUnit, TurnaroundTime } from '@/components/records/types';

/** Naira is not subdivided in practice — kobo pricing is float noise, not money. */
export function roundNaira(amount: number): number {
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount);
}

/** The Settings-derived rates a line price depends on. */
export interface PricingRates {
  /** Percent, e.g. 10 for +10%. */
  wasteFactor: number;
  laminationCost: number;
  eyeletCost: number;
  turnaroundStandard: number;
  turnaroundRush: number;
  turnaroundSameDay: number;
}

/**
 * Narrow the Settings blob down to just the rates pricing depends on, so the
 * arithmetic below never sees — and can never quietly start reading — anything
 * else on Settings.
 */
export function pricingRatesFrom(settings: Partial<PricingRates> | null | undefined): PricingRates {
  return {
    wasteFactor: settings?.wasteFactor || 0,
    laminationCost: settings?.laminationCost || 0,
    eyeletCost: settings?.eyeletCost || 0,
    turnaroundStandard: settings?.turnaroundStandard || 1.0,
    turnaroundRush: settings?.turnaroundRush || 1.5,
    turnaroundSameDay: settings?.turnaroundSameDay || 2.0,
  };
}

export interface LineTotalInput {
  width: number;
  height: number;
  jobUnit: JobUnit;
  quantity: number;
  unitPrice: number;
  lamination: boolean;
  eyelets: boolean;
  turnaroundTime: TurnaroundTime;
}

/** Billable area in square feet, waste factor included. */
export function effectiveAreaSqFt(
  width: number,
  height: number,
  jobUnit: JobUnit,
  wasteFactor: number,
): number {
  const raw = jobUnit === 'ft' ? width * height : (width * height) / 144;
  const withWaste = raw * (1 + (wasteFactor || 0) / 100);
  // A zero-area job still bills as 1 sqft — preserved from the original
  // inline calculation so existing quotes price identically.
  return withWaste > 0 ? withWaste : 1;
}

function turnaroundMultiplier(turnaround: TurnaroundTime, rates: PricingRates): number {
  if (turnaround === 'Standard') return rates.turnaroundStandard || 1.0;
  if (turnaround === 'Rush') return rates.turnaroundRush || 1.5;
  return rates.turnaroundSameDay || 2.0;
}

/**
 * Price one line, rounded to whole naira.
 *
 * NOTE — the Minimum Order Value is deliberately NOT applied here. It is a
 * minimum on the *order*, applied once by `computeBatchTotals`.
 *
 * This is a PRICING CHANGE, not a refactor. The previous inline version at
 * job-detail-card.tsx:142 did `Math.max(rawTotal, minOrderPrice)` on every
 * line, so a 3-line order of ₦600 items was charged the ₦1,000 minimum three
 * times: ₦3,000. It is ₦1,800 now — the top-up applies once, to the order.
 * Single-line orders are unaffected.
 */
export function lineTotal(input: LineTotalInput, rates: PricingRates): number {
  const quantity = input.quantity || 1;
  const area = effectiveAreaSqFt(input.width, input.height, input.jobUnit, rates.wasteFactor);

  const base = area * (input.unitPrice || 0) * quantity;
  const lamination = input.lamination ? area * (rates.laminationCost || 0) * quantity : 0;
  const eyelets = input.eyelets ? (rates.eyeletCost || 0) * quantity : 0;

  const raw = (base + lamination) * turnaroundMultiplier(input.turnaroundTime, rates) + eyelets;
  return roundNaira(raw);
}

export interface BatchTotals {
  subtotal: number;
  adjustments: BatchAdjustment[];
  totalAmount: number;
}

export interface BatchTotalsInput {
  /** Line totals, each already rounded by `lineTotal`. */
  lineTotals: number[];
  /** Minimum Order Value from Settings. */
  mov: number;
  /** Delivery charge, or 0 for pickup. */
  delivery: number;
}

/**
 * Roll line totals up into a batch, surfacing every naira above the subtotal
 * as a named adjustment row.
 *
 * ── DECISION: THE MOV IS A MINIMUM ON PRINTING, NOT ON THE INVOICE ──────────
 *
 * The top-up is computed against the goods subtotal ALONE. Delivery is added
 * afterwards and never counts toward reaching the minimum.
 *
 *   goods ₦600, delivery ₦2,000, MOV ₦1,000
 *     correct:  max(600, 1000) + 2000 = ₦3,000   -> ₦400 top-up
 *     wrong:    max(600 + 2000, 1000) = ₦2,600   -> no top-up
 *
 * Delivery is pass-through, not printing revenue — a large delivery must not
 * let a tiny print job dodge the minimum. This is an explicit decision, not an
 * accident of operator precedence: do not "simplify" it by folding delivery
 * into the max().
 *
 * ── THE TOP-UP HERE WAS DEAD CODE BEFORE THIS CHANGE ────────────────────────
 *
 * new-sales.tsx did `Math.max(batchSubtotal, mov) + delivery`, but every line
 * reaching it had ALREADY been floored at the MOV by job-detail-card.tsx:142.
 * A subtotal built from floored lines is always >= the MOV, so the batch-level
 * max() could never fire. Removing the per-line floor is what gives this branch
 * its first real effect — do not read the removal as a no-op refactor.
 */
export function computeBatchTotals(input: BatchTotalsInput): BatchTotals {
  const subtotal = input.lineTotals.reduce((sum, total) => sum + roundNaira(total), 0);

  // An empty batch is worth nothing, delivery included.
  if (subtotal <= 0) return { subtotal: 0, adjustments: [], totalAmount: 0 };

  const adjustments: BatchAdjustment[] = [];

  const movTopUp = roundNaira(input.mov || 0) - subtotal;
  if (movTopUp > 0) {
    adjustments.push({ kind: 'mov', label: 'Minimum order adjustment', amount: movTopUp });
  }

  const delivery = roundNaira(input.delivery || 0);
  if (delivery > 0) {
    adjustments.push({ kind: 'delivery', label: 'Delivery', amount: delivery });
  }

  const totalAmount = adjustments.reduce((sum, a) => sum + a.amount, subtotal);
  return { subtotal, adjustments, totalAmount };
}

/* ------------------------------------------------------------------ *
 * LEGACY SHIM — batches written before `subtotal` / `adjustments[]` existed.
 *
 * Sits alongside `adaptLegacyRecords` in sales-repository.ts: both exist only
 * to make pre-migration data render correctly, and both are deletable once the
 * data is migrated.
 *
 * UNLIKE `adaptLegacyRecords`, THIS ONE IS BACKFILLABLE. It reads nothing but
 * the stored node — never Settings — so a future migration can run exactly
 * this function over the tree, persist the results, and then delete the shim.
 * That backfill is deliberately NOT part of Stage 1; historic `totalAmount`
 * values stay untouched until it happens.
 *
 * Why it never reads Settings: we do not know what the MOV was when a historic
 * sale was written. Recomputing the top-up from today's MOV would restate what
 * the customer was charged. The residual below is derived from the stored
 * numbers alone, so it is reproducible and honest.
 * ------------------------------------------------------------------ */

export interface LegacyMoneyInput {
  /** Line totals as stored on the historic node. */
  lineTotals: number[];
  /** The historic `totalAmount` — authoritative. What the customer was charged. */
  totalAmount: number;
  /** The historic `deliveryCost`, if any. */
  delivery: number;
}

/**
 * Reconstruct `subtotal` / `adjustments[]` for a batch that predates them.
 *
 * `totalAmount` is returned exactly as stored — never recomputed. Whatever the
 * stored total exceeds the line items by becomes an adjustment, so the invoice
 * reconciles without restating the charge.
 */
export function deriveLegacyMoneyFields(input: LegacyMoneyInput): BatchTotals {
  const subtotal = input.lineTotals.reduce((sum, total) => sum + roundNaira(total), 0);

  // ROUND THE STORED TOTAL FIRST, THEN DERIVE THE RESIDUAL FROM THE ROUNDED
  // FIGURE. Order matters, and getting it backwards breaks the invariant.
  //
  // A historic node can hold a fractional total written before rounding existed:
  //
  //   stored lines  562.5 x3      -> subtotal (rounded lines) = 1689
  //   stored total  1687.50       -> rounded to the naira     = 1688
  //   residual      1688 - 1689   = -1
  //   check         1689 + (-1)   = 1688 === totalAmount      ✓
  //
  // Deriving the residual from the RAW 1687.50 would give -1.5, and
  // 1689 + (-1.5) = 1687.5 — which is not whole naira and leaves the invoice
  // showing a half-naira row. Rounding first is what makes
  // `subtotal + adjustments === totalAmount` hold exactly.
  //
  // This is not a restatement of the charge: 1687.50 rounded is what
  // `formatCurrency` already displays. We are recording the charge to the
  // naira, not recomputing it from Settings.
  const totalAmount = roundNaira(input.totalAmount || 0);

  const adjustments: BatchAdjustment[] = [];

  const delivery = roundNaira(input.delivery || 0);
  if (delivery > 0) {
    adjustments.push({ kind: 'delivery', label: 'Delivery', amount: delivery });
  }

  // Whatever is left once lines and delivery are accounted for. On a historic
  // node this is usually the MOV top-up, but it can also be float drift or a
  // manual edit — so it is labelled neutrally rather than claimed to be a
  // minimum-order adjustment we cannot actually verify. All three terms are
  // whole naira already, so this is exact.
  const residual = totalAmount - subtotal - delivery;
  if (residual !== 0) {
    adjustments.push({ kind: 'legacy', label: 'Adjustment', amount: residual });
  }

  return { subtotal, adjustments, totalAmount };
}
