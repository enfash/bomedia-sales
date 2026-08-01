/**
 * Unit tests for src/utils/date.ts
 *
 * These pin the CORRECT, local-time behaviour of `isToday` — which matters
 * because audit §1.3 bug #1 is that `computeDashboardMetrics` disagrees with
 * this module about what "today" means. See analytics.test.ts.
 *
 * The whole file assumes Africa/Lagos (UTC+1); jest.setup.ts enforces that.
 */

import { formatDate, isOverdue, isToday, parseDate } from '@/utils/date';

/** 2026-07-15 10:00 WAT === 09:00 UTC. Same calendar day in both zones. */
const NOW = new Date('2026-07-15T10:00:00+01:00');

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('parseDate', () => {
  it('passes a Date through unchanged', () => {
    const d = new Date('2026-03-04T05:06:07Z');
    expect(parseDate(d)).toBe(d);
  });

  it('parses an ISO string', () => {
    expect(parseDate('2026-03-04T05:06:07Z').toISOString()).toBe('2026-03-04T05:06:07.000Z');
  });

  it('parses epoch milliseconds', () => {
    expect(parseDate(1_770_000_000_000).getTime()).toBe(1_770_000_000_000);
  });

  it('unwraps a Firestore-style timestamp via toDate()', () => {
    const target = new Date('2026-03-04T05:06:07Z');
    expect(parseDate({ toDate: () => target })).toBe(target);
  });

  it('converts a {seconds} timestamp to milliseconds', () => {
    expect(parseDate({ seconds: 1_770_000_000 }).getTime()).toBe(1_770_000_000_000);
  });

  it('prefers toDate() over seconds when both are present', () => {
    const target = new Date('2026-03-04T05:06:07Z');
    expect(parseDate({ toDate: () => target, seconds: 1 })).toBe(target);
  });

  it('falls back to now for an unparseable string', () => {
    expect(parseDate('not a date').getTime()).toBe(NOW.getTime());
  });

  it('falls back to now for null', () => {
    expect(parseDate(null).getTime()).toBe(NOW.getTime());
  });

  it('falls back to now for an empty string', () => {
    expect(parseDate('').getTime()).toBe(NOW.getTime());
  });
});

describe('formatDate', () => {
  it('returns an empty string for falsy input', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate('')).toBe('');
  });

  it('formats with explicit options', () => {
    const formatted = formatDate('2026-07-15T10:00:00+01:00', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
    expect(formatted).toBe('Jul 15, 2026');
  });

  it('returns a non-empty locale string with no options', () => {
    expect(formatDate('2026-07-15T10:00:00+01:00')).not.toBe('');
  });
});

describe('isToday', () => {
  it('is true for the current moment', () => {
    expect(isToday(NOW)).toBe(true);
  });

  it('is true at the first minute of the local day (00:30 WAT)', () => {
    // The exact case audit §1.3 bug #1 gets wrong in analytics.ts.
    expect(isToday('2026-07-15T00:30:00+01:00')).toBe(true);
  });

  it('is true at local midnight', () => {
    expect(isToday('2026-07-15T00:00:00+01:00')).toBe(true);
  });

  it('is true at the last minute of the local day (23:59 WAT)', () => {
    expect(isToday('2026-07-15T23:59:59+01:00')).toBe(true);
  });

  it('is false one second before the local day starts', () => {
    expect(isToday('2026-07-14T23:59:59+01:00')).toBe(false);
  });

  it('is false for the next local day', () => {
    expect(isToday('2026-07-16T00:00:00+01:00')).toBe(false);
  });

  it('is false for falsy input', () => {
    expect(isToday(null)).toBe(false);
    expect(isToday('')).toBe(false);
  });
});

describe('isOverdue', () => {
  const daysBefore = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

  it('is false for falsy input', () => {
    expect(isOverdue(null)).toBe(false);
    expect(isOverdue('')).toBe(false);
  });

  it('is false for something created just now', () => {
    expect(isOverdue(NOW.toISOString())).toBe(false);
  });

  it('is false at exactly the 7-day threshold (strict >)', () => {
    expect(isOverdue(daysBefore(7))).toBe(false);
  });

  it('is true just past the 7-day threshold', () => {
    expect(isOverdue(new Date(NOW.getTime() - (7 * 24 * 60 * 60 * 1000 + 1)).toISOString())).toBe(true);
  });

  it('is true well past the threshold', () => {
    expect(isOverdue(daysBefore(10))).toBe(true);
  });

  it('honours a custom threshold', () => {
    expect(isOverdue(daysBefore(10), 30)).toBe(false);
    expect(isOverdue(daysBefore(10), 3)).toBe(true);
  });

  it('is false for a future date', () => {
    expect(isOverdue(new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString())).toBe(false);
  });
});
