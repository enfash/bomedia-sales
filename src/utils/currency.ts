/**
 * Currency display. One formatter, one locale, everywhere.
 *
 * The rounding here is a SAFETY NET, not the fix. Amounts are rounded to whole
 * naira at every write boundary by utils/money.ts, so by the time a figure
 * reaches this module it should already be whole. See docs/AUDIT_2026-07.md.
 */

/**
 * Locale is pinned rather than left to the device.
 *
 * A bare `toLocaleString()` follows whatever locale the phone is set to, so the
 * same invoice already rendered differently on different handsets — 1,234 here,
 * 1.234 there. Pinning to en-NG makes the output deterministic; that is a
 * correctness fix, not a styling preference.
 *
 * Zero fraction digits: the default `maximumFractionDigits: 3` is what let
 * accumulated float error surface as fractional kobo on a real invoice.
 */
const NAIRA = new Intl.NumberFormat('en-NG', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/** Formats an amount as whole naira, e.g. `₦1,235`. */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '₦0';
  }
  return `₦${NAIRA.format(amount)}`;
}

const COMPACT = new Intl.NumberFormat('en-NG', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
});

/**
 * Abbreviated form for dashboard tiles, e.g. `₦1.2M`.
 *
 * FOR StatCard / KpiCard ONLY. Never use this in a table, a line item, a cost
 * breakdown or an invoice: it discards precision, and a customer-facing figure
 * must always be the exact amount. `formatCurrency` stays the default anywhere
 * money is *stated* rather than glanced at.
 */
export function formatCurrencyCompact(amount: number | null | undefined): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '₦0';
  }
  // Below ₦10k the compact form ("₦9.5K") is less legible than the real number.
  if (Math.abs(amount) < 10_000) return formatCurrency(amount);
  return `₦${COMPACT.format(amount)}`;
}
