/**
 * Date utility functions for parsing, formatting, and overdue logic.
 */

export function formatDate(dateInput: string | number | Date, options?: Intl.DateTimeFormatOptions): string {
  if (!dateInput) return '';
  const date = new Date(dateInput);
  if (options) {
    return date.toLocaleDateString('en-US', options);
  }
  return date.toLocaleDateString();
}

/**
 * Checks if a given timestamp or date string is older than a specified number of days
 * compared to the current date. Default threshold is 7 days.
 */
export function isOverdue(createdAtInput: string | number | Date, thresholdDays = 7): boolean {
  if (!createdAtInput) return false;
  const createdAt = new Date(createdAtInput);
  return (new Date().getTime() - createdAt.getTime()) > thresholdDays * 24 * 60 * 60 * 1000;
}
