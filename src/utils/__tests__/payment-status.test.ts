/**
 * Unit tests for src/utils/payment-status.ts
 *
 * Contains the ratcheted pair for audit §1.3 bug #4 (Overdue and Unpaid are
 * byte-identical). See docs/AUDIT_2026-07.md for the Stage 1 checklist.
 */

import type { PaymentStatus } from '@/components/records/types';
import {
  computePaymentStatus,
  getPaymentStatus,
  getStatusColors,
  STATUS_META,
} from '@/utils/payment-status';

describe('computePaymentStatus', () => {
  describe('with a non-zero total', () => {
    const TOTAL = 50_000;

    it.each<[string, number, boolean, PaymentStatus]>([
      ['nothing paid', 0, false, 'Unpaid'],
      ['nothing paid and past due', 0, true, 'Overdue'],
      ['part paid', 20_000, false, 'Partial'],
      ['paid in full', 50_000, false, 'Paid'],
      ['paid over', 60_000, false, 'Overpaid'],
    ])('%s -> %s', (_label, paid, overdue, expected) => {
      expect(computePaymentStatus(TOTAL, paid, overdue)).toBe(expected);
    });

    it('treats a part-paid batch as Partial even when past due', () => {
      // The overdue flag is only consulted on the fully-unpaid branch.
      expect(computePaymentStatus(TOTAL, 20_000, true)).toBe('Partial');
    });

    it('treats a fully-paid batch as Paid even when past due', () => {
      expect(computePaymentStatus(TOTAL, TOTAL, true)).toBe('Paid');
    });

    it('is Paid at exactly the total (>= boundary)', () => {
      expect(computePaymentStatus(TOTAL, TOTAL)).toBe('Paid');
    });

    it('is Overpaid one naira above the total', () => {
      expect(computePaymentStatus(TOTAL, TOTAL + 1)).toBe('Overpaid');
    });

    it('is Partial one naira below the total', () => {
      expect(computePaymentStatus(TOTAL, TOTAL - 1)).toBe('Partial');
    });
  });

  describe('with a zero total', () => {
    // Both the Paid and Overpaid branches guard on `totalAmount > 0`, so a
    // zero-value batch can never read as Paid. Pinned deliberately.
    it('is Unpaid when nothing is paid', () => {
      expect(computePaymentStatus(0, 0)).toBe('Unpaid');
    });

    it('is Overdue when nothing is paid and past due', () => {
      expect(computePaymentStatus(0, 0, true)).toBe('Overdue');
    });

    it('is Partial — not Overpaid — when money is paid against it', () => {
      expect(computePaymentStatus(0, 500)).toBe('Partial');
    });
  });

  it('defaults isOverdue to false', () => {
    expect(computePaymentStatus(50_000, 0)).toBe('Unpaid');
  });
});

describe('getPaymentStatus', () => {
  it('returns the status alongside its STATUS_META colours', () => {
    expect(getPaymentStatus(50_000, 50_000)).toEqual({
      status: 'Paid',
      color: STATUS_META.Paid.color,
      backgroundColor: STATUS_META.Paid.bg,
    });
  });

  it('threads the overdue flag through to the status', () => {
    expect(getPaymentStatus(50_000, 0, true).status).toBe('Overdue');
  });

  it('sources colours from STATUS_META for every status', () => {
    const cases: [number, number, boolean][] = [
      [50_000, 0, false],
      [50_000, 0, true],
      [50_000, 20_000, false],
      [50_000, 50_000, false],
      [50_000, 60_000, false],
    ];
    for (const [total, paid, overdue] of cases) {
      const result = getPaymentStatus(total, paid, overdue);
      expect(result.color).toBe(STATUS_META[result.status].color);
      expect(result.backgroundColor).toBe(STATUS_META[result.status].bg);
    }
  });
});

describe('getStatusColors', () => {
  it('passes canonical payment statuses straight through', () => {
    expect(getStatusColors('Paid')).toEqual({ text: STATUS_META.Paid.color, bg: STATUS_META.Paid.bg });
    expect(getStatusColors('Partial')).toEqual({
      text: STATUS_META.Partial.color,
      bg: STATUS_META.Partial.bg,
    });
  });

  it('maps positive quote outcomes onto Paid', () => {
    for (const status of ['Won', 'Approved']) {
      expect(getStatusColors(status)).toEqual({ text: STATUS_META.Paid.color, bg: STATUS_META.Paid.bg });
    }
  });

  it('maps Negotiation onto Partial', () => {
    expect(getStatusColors('Negotiation')).toEqual({
      text: STATUS_META.Partial.color,
      bg: STATUS_META.Partial.bg,
    });
  });

  it('maps negative quote outcomes onto Unpaid', () => {
    for (const status of ['Rejected', 'Lost']) {
      expect(getStatusColors(status)).toEqual({
        text: STATUS_META.Unpaid.color,
        bg: STATUS_META.Unpaid.bg,
      });
    }
  });

  it('gives Cancelled its own neutral treatment', () => {
    expect(getStatusColors('Cancelled')).toEqual({ text: '#546E7A', bg: '#ECEFF1' });
  });

  it('falls back to a neutral for anything unrecognised', () => {
    expect(getStatusColors('Some New Status')).toEqual({ text: '#454651', bg: '#eff4ff' });
    expect(getStatusColors('')).toEqual({ text: '#454651', bg: '#eff4ff' });
  });
});

describe('STATUS_META', () => {
  const ALL: PaymentStatus[] = ['Paid', 'Partial', 'Unpaid', 'Overdue', 'Overpaid'];

  it('defines a label, colour and background for every status', () => {
    for (const status of ALL) {
      expect(STATUS_META[status].label).toBeTruthy();
      expect(STATUS_META[status].color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(STATUS_META[status].bg).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  /* ------------------------------------------------------------------ *
   * AUDIT §1.3 BUG #4 — Overdue and Unpaid are visually identical.
   *
   * Both are `color: '#ba1a1a', bg: '#ffdad6'`. Separating the two statuses is
   * pointless if they render the same: one of them means "phone this client
   * today".
   *
   * Ratchet pair — BOTH tests go red the moment the bug is fixed:
   *   A: `it.failing` asserting the CORRECT behaviour. Stage 1 flips it to `it`.
   *   B: plain `it` pinning TODAY'S WRONG value. Stage 1 deletes it.
   *
   * Deliberately asserts on `color` only, not `bg` — §1.3 allows any of
   * "deeper red, a filled chip, or a clock glyph", so Stage 1 keeps its design
   * latitude on the background.
   * ------------------------------------------------------------------ */
  describe('§1.3 bug #4 — Overdue vs Unpaid', () => {
    // A — the behaviour we want. Currently throws, so `it.failing` passes.
    // STAGE 1: flip `it.failing` -> `it`. No other edit.
    it.failing('gives Overdue a different foreground colour from Unpaid', () => {
      expect(STATUS_META.Overdue.color).not.toBe(STATUS_META.Unpaid.color);
    });

    // B — the behaviour we have. Currently passes.
    // STAGE 1: delete this test.
    it('current behaviour: Overdue and Unpaid render identical colours', () => {
      expect(STATUS_META.Overdue.color).toBe('#ba1a1a');
      expect(STATUS_META.Unpaid.color).toBe('#ba1a1a');
      expect(STATUS_META.Overdue.bg).toBe(STATUS_META.Unpaid.bg);
    });

    // Survives Stage 1: the labels already differ, so only colour is at issue.
    it('the two statuses do at least carry different labels', () => {
      expect(STATUS_META.Overdue.label).not.toBe(STATUS_META.Unpaid.label);
    });
  });
});
