/**
 * What a staff member is told about payments she cannot read.
 *
 * The failure being designed against is a short list reading as "no payment was
 * taken", which is how money already collected gets collected again. The second
 * failure — the one this file spends most of its length on — is a WRONG figure,
 * which is worse than the vague warning it would replace.
 */

import { deriveHiddenPayments } from '@/services/hidden-payments';

const visible = (...amounts: number[]) => amounts.map((amount) => ({ amount }));

describe('nothing to say', () => {
  it('says nothing when every payment is hers', () => {
    expect(deriveHiddenPayments({ totalPaid: 5000, refCount: 2, visible: visible(2000, 3000) })).toBeNull();
  });

  it('says nothing on a sale with no payments at all', () => {
    expect(deriveHiddenPayments({ totalPaid: 0, refCount: 0, visible: [] })).toBeNull();
  });

  it('never reports a zero — "₦0 collected by others" is noise', () => {
    const result = deriveHiddenPayments({ totalPaid: 4000, refCount: 1, visible: visible(4000) });
    expect(result).toBeNull();
  });
});

describe('the hidden figures', () => {
  it('derives amount and count from the sale node alone', () => {
    // She sees nothing; the sale says ₦5,000 across one entry.
    expect(deriveHiddenPayments({ totalPaid: 5000, refCount: 1, visible: [] })).toEqual({
      amount: 5000,
      count: 1,
    });
  });

  it('subtracts her own entries from both figures', () => {
    expect(deriveHiddenPayments({ totalPaid: 9000, refCount: 3, visible: visible(1500, 500) })).toEqual({
      amount: 7000,
      count: 1,
    });
  });

  it('handles several hidden payments', () => {
    expect(deriveHiddenPayments({ totalPaid: 12000, refCount: 4, visible: visible(2000) })).toEqual({
      amount: 10000,
      count: 3,
    });
  });
});

describe('a wrong number is worse than the warning it replaces', () => {
  it('refuses a NEGATIVE amount — a colleague reversal she cannot see', () => {
    // Her own entries total more than the sale says was collected, because a
    // reversal by someone else is hidden from her. There is no honest figure to
    // print here.
    expect(deriveHiddenPayments({ totalPaid: 3000, refCount: 3, visible: visible(4000) })).toBe('unknown');
  });

  it('refuses a negative count', () => {
    expect(deriveHiddenPayments({ totalPaid: 9000, refCount: 1, visible: visible(2000, 3000) })).toBe(
      'unknown',
    );
  });

  it('refuses money with no entry behind it', () => {
    // totalPaid moved but the index knows of no other entry: the two sources
    // disagree, so neither is quotable.
    expect(deriveHiddenPayments({ totalPaid: 5000, refCount: 1, visible: visible(2000) })).toBe('unknown');
  });

  it('refuses an entry with no money behind it', () => {
    expect(deriveHiddenPayments({ totalPaid: 2000, refCount: 2, visible: visible(2000) })).toBe('unknown');
  });

  it('refuses a sale with payments but no refs at all', () => {
    // Legacy or backfill-pending: the ref index cannot answer, so the count
    // cannot be stated.
    expect(deriveHiddenPayments({ totalPaid: 5000, refCount: 0, visible: [] })).toBe('unknown');
  });
});

describe('arithmetic', () => {
  it('rounds at the boundary, like every other money figure', () => {
    const result = deriveHiddenPayments({ totalPaid: 5000.4, refCount: 2, visible: visible(1000.4) });
    expect(result).toEqual({ amount: 4000, count: 1 });
  });

  it('treats a missing amount on an entry as zero rather than NaN', () => {
    const result = deriveHiddenPayments({
      totalPaid: 5000,
      refCount: 2,
      visible: [{ amount: undefined as unknown as number }],
    });
    expect(result).toEqual({ amount: 5000, count: 1 });
  });
});
