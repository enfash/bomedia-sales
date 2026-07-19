/**
 * Formats a number to currency string, defaulting to Nigerian Naira (₦).
 * Extracted as part of Phase 3 to unify currency display formatting across the app.
 */
export function formatCurrency(amount: number | null | undefined): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return '₦0';
  }
  return `₦${amount.toLocaleString()}`;
}
