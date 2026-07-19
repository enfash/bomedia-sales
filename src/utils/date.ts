/**
 * Date utility functions for parsing, formatting, and overdue logic.
 */

export function parseDate(dateInput: any): Date {
  if (!dateInput) return new Date();
  if (dateInput instanceof Date) return dateInput;
  if (typeof dateInput === 'object') {
    if (typeof dateInput.toDate === 'function') return dateInput.toDate();
    if (typeof dateInput.seconds === 'number') return new Date(dateInput.seconds * 1000);
  }
  const parsed = new Date(dateInput);
  if (isNaN(parsed.getTime())) return new Date();
  return parsed;
}

export function formatDate(dateInput: any, options?: Intl.DateTimeFormatOptions): string {
  if (!dateInput) return '';
  const date = parseDate(dateInput);
  if (options) {
    return date.toLocaleDateString('en-US', options);
  }
  return date.toLocaleDateString();
}

/**
 * Checks if a given timestamp or date string is older than a specified number of days
 * compared to the current date. Default threshold is 7 days.
 */
export function isOverdue(createdAtInput: any, thresholdDays = 7): boolean {
  if (!createdAtInput) return false;
  const createdAt = parseDate(createdAtInput);
  return (new Date().getTime() - createdAt.getTime()) > thresholdDays * 24 * 60 * 60 * 1000;
}
