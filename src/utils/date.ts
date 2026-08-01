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
 * True when two dates fall on the same LOCAL calendar day.
 *
 * This is the one definition of "same day" in the app. Do not compare
 * `toISOString().split('T')[0]` — that is a UTC day boundary, and Lagos is
 * UTC+1, so a sale logged at 00:30 WAT lands on the previous UTC date and
 * drops out of "today" entirely.
 */
export function isSameLocalDay(a: any, b: any): boolean {
  if (!a || !b) return false;
  const x = parseDate(a);
  const y = parseDate(b);
  return (
    x.getFullYear() === y.getFullYear() &&
    x.getMonth() === y.getMonth() &&
    x.getDate() === y.getDate()
  );
}

/**
 * `YYYY-MM-DD` for the LOCAL calendar day — the key to bucket or group by.
 *
 * Matches the components `createBatch` already uses to build its storage path,
 * so a sale's date bucket and its "today" both mean the same thing.
 */
export function localDayKey(dateInput: any): string {
  const d = parseDate(dateInput);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** True when the given date/timestamp falls on the local calendar's current day. */
export function isToday(dateInput: any): boolean {
  if (!dateInput) return false;
  return isSameLocalDay(dateInput, new Date());
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

/**
 * When a sale actually falls due.
 *
 * An explicit `dueDate` always wins. Only when none was set do we fall back to
 * `createdAt + defaultTermsDays` — which is what the old fixed 7-day window
 * assumed for every sale, including those given 30-day terms.
 */
export function resolveDueDate(
  createdAt: any,
  dueDate: string | undefined,
  defaultTermsDays: number,
): Date {
  if (dueDate) return parseDate(dueDate);
  const created = parseDate(createdAt);
  return new Date(created.getTime() + defaultTermsDays * 24 * 60 * 60 * 1000);
}

/**
 * True when a sale is past its due date.
 *
 * This is the single overdue rule — `normalizeBatch` and the legacy
 * `adaptLegacyRecords` shim both call it, so the terms logic exists once.
 */
export function isPastDue(
  createdAt: any,
  dueDate: string | undefined,
  defaultTermsDays: number,
): boolean {
  if (!createdAt && !dueDate) return false;
  return new Date().getTime() > resolveDueDate(createdAt, dueDate, defaultTermsDays).getTime();
}
