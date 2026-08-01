/**
 * Unit tests for src/utils/currency.ts
 *
 * Contains the ratcheted pair for audit §1.3 bug #3 (float error renders
 * fractional kobo). See docs/AUDIT_2026-07.md for the Stage 1 checklist.
 */

import { formatCurrency, formatCurrencyCompact } from '@/utils/currency';

describe('formatCurrency', () => {
  describe('non-numeric input', () => {
    it('returns ₦0 for null', () => {
      expect(formatCurrency(null)).toBe('₦0');
    });

    it('returns ₦0 for undefined', () => {
      expect(formatCurrency(undefined)).toBe('₦0');
    });

    it('returns ₦0 for NaN', () => {
      expect(formatCurrency(NaN)).toBe('₦0');
    });
  });

  describe('whole amounts', () => {
    it('formats zero', () => {
      expect(formatCurrency(0)).toBe('₦0');
    });

    it('formats a small amount without a separator', () => {
      expect(formatCurrency(600)).toBe('₦600');
    });

    it('groups thousands', () => {
      expect(formatCurrency(1000)).toBe('₦1,000');
    });

    it('groups millions', () => {
      expect(formatCurrency(1_000_000)).toBe('₦1,000,000');
    });

    it('formats a negative amount', () => {
      expect(formatCurrency(-2500)).toBe('₦-2,500');
    });
  });

  /* ------------------------------------------------------------------ *
   * AUDIT §1.3 BUG #3 — accumulated float error renders fractional kobo.
   *
   * `formatCurrency` uses a bare `toLocaleString()`, whose default
   * `maximumFractionDigits` is 3. An amount that has picked up float error
   * through repeated addition (unitPrice * qty summed across line items)
   * therefore renders with stray decimals on a real invoice.
   *
   * Ratchet pair — BOTH tests go red the moment the bug is fixed:
   *   A: `it.failing` asserting the CORRECT output. Stage 1 flips it to `it`.
   *   B: plain `it` pinning TODAY'S WRONG output. Stage 1 deletes it.
   *
   * B exists because `it.failing` only checks THAT the body throws, not why —
   * a broken import or bad fixture would make A pass while proving nothing.
   * B exercises the same import with a plain assertion, so any such breakage
   * shows up as a normal failure.
   * ------------------------------------------------------------------ */
  describe('§1.3 bug #3 — fractional kobo from float error', () => {
    const DRIFTED = 1234.5600000000001;

    // A — the behaviour we want. Currently throws, so `it.failing` passes.
    // STAGE 1: flip `it.failing` -> `it`. No other edit.
    it('renders a float-drifted amount as whole naira', () => {
      expect(formatCurrency(DRIFTED)).toBe('₦1,235');
    });

    // B — the behaviour we have. Currently passes.
    // STAGE 1: delete this test.
    // Supporting evidence that this is a real formatting fault and not a
    // property of the input number itself. Survives Stage 1.
    it('the drifted value is within a kobo of 1234.56', () => {
      expect(DRIFTED).toBeCloseTo(1234.56, 6);
    });
  });
});

describe('formatCurrencyCompact', () => {
  it('returns ₦0 for null, undefined and NaN', () => {
    expect(formatCurrencyCompact(null)).toBe('₦0');
    expect(formatCurrencyCompact(undefined)).toBe('₦0');
    expect(formatCurrencyCompact(NaN)).toBe('₦0');
  });

  it('falls back to the exact figure below ₦10k, where compact is less legible', () => {
    expect(formatCurrencyCompact(0)).toBe('₦0');
    expect(formatCurrencyCompact(600)).toBe('₦600');
    expect(formatCurrencyCompact(9_500)).toBe('₦9,500');
  });

  it('abbreviates thousands and millions', () => {
    expect(formatCurrencyCompact(10_000)).toBe('₦10K');
    expect(formatCurrencyCompact(1_200_000)).toBe('₦1.2M');
  });

  it('abbreviates negatives too', () => {
    expect(formatCurrencyCompact(-1_200_000)).toBe('₦-1.2M');
  });

  // Guards the rule in the doc comment: this is a glanceable form, so it is
  // lossy by design. Anything customer-facing must use formatCurrency.
  it('is lossy — two different amounts can render identically', () => {
    expect(formatCurrencyCompact(1_200_000)).toBe(formatCurrencyCompact(1_249_999));
    expect(formatCurrency(1_200_000)).not.toBe(formatCurrency(1_249_999));
  });
});
