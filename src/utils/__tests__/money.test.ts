import {
  computeBatchTotals,
  effectiveAreaSqFt,
  lineTotal,
  roundNaira,
  type PricingRates,
} from '@/utils/money';

/** Settings-shaped rates with everything neutral, so each test varies one thing. */
const RATES: PricingRates = {
  wasteFactor: 0,
  laminationCost: 0,
  eyeletCost: 0,
  turnaroundStandard: 1.0,
  turnaroundRush: 1.5,
  turnaroundSameDay: 2.0,
};

describe('roundNaira', () => {
  it('rounds to whole naira', () => {
    expect(roundNaira(562.5)).toBe(563);
    expect(roundNaira(562.4)).toBe(562);
    expect(roundNaira(1234.5600000000001)).toBe(1235);
  });

  it('leaves whole amounts alone', () => {
    expect(roundNaira(0)).toBe(0);
    expect(roundNaira(1000)).toBe(1000);
  });

  // Adjustments may be negative — a discount is the obvious future case — so
  // the rounding rule has to hold on that side too.
  it('handles negative amounts', () => {
    expect(roundNaira(-1.5)).toBe(-1); // Math.round: -1.5 -> -1
    expect(roundNaira(-400)).toBe(-400);
  });

  it('coerces non-finite input to zero rather than propagating NaN into money', () => {
    expect(roundNaira(NaN)).toBe(0);
    expect(roundNaira(Infinity)).toBe(0);
  });
});

describe('effectiveAreaSqFt', () => {
  it('multiplies width by height when the unit is feet', () => {
    expect(effectiveAreaSqFt(2.5, 1.5, 'ft', 0)).toBe(3.75);
  });

  it('divides by 144 when the unit is inches', () => {
    expect(effectiveAreaSqFt(24, 12, 'in', 0)).toBe(2);
  });

  it('applies the waste factor as a percentage uplift', () => {
    expect(effectiveAreaSqFt(10, 10, 'ft', 10)).toBeCloseTo(110);
  });

  it('bills a zero-area job as one square foot', () => {
    expect(effectiveAreaSqFt(0, 0, 'ft', 0)).toBe(1);
  });
});

describe('lineTotal', () => {
  const line = (over: Partial<Parameters<typeof lineTotal>[0]> = {}) =>
    lineTotal(
      {
        width: 2.5,
        height: 1.5,
        jobUnit: 'ft',
        quantity: 1,
        unitPrice: 150,
        lamination: false,
        eyelets: false,
        turnaroundTime: 'Standard',
        ...over,
      },
      RATES,
    );

  // The fixture behind the money invariant: 150/sqft x 3.75 sqft = 562.5.
  it('rounds a fractional line total to whole naira', () => {
    expect(line()).toBe(563);
  });

  it('multiplies by quantity', () => {
    expect(line({ quantity: 3 })).toBe(1688); // 562.5 * 3 = 1687.5 -> 1688
  });

  it('applies the rush turnaround multiplier', () => {
    expect(line({ turnaroundTime: 'Rush' })).toBe(844); // 562.5 * 1.5 = 843.75
  });

  it('adds lamination per square foot and eyelets per unit', () => {
    const rates = { ...RATES, laminationCost: 20, eyeletCost: 100 };
    // (3.75 * 150 + 3.75 * 20) * 1.0 + 100 = 637.5 + 100 = 737.5 -> 738
    expect(lineTotal(
      { width: 2.5, height: 1.5, jobUnit: 'ft', quantity: 1, unitPrice: 150,
        lamination: true, eyelets: true, turnaroundTime: 'Standard' },
      rates,
    )).toBe(738);
  });

  // Guards the decision recorded in money.ts: the MOV is not a line-level rule.
  it('does NOT apply the minimum order value to a line', () => {
    expect(line({ unitPrice: 10 })).toBe(38); // 3.75 * 10 = 37.5 -> 38, not 1000
  });

  it('always returns whole naira', () => {
    for (const unitPrice of [1, 7, 13.33, 150, 999.99]) {
      expect(Number.isInteger(line({ unitPrice }))).toBe(true);
    }
  });
});

describe('computeBatchTotals', () => {
  it('sums rounded line totals into the subtotal', () => {
    const { subtotal } = computeBatchTotals({ lineTotals: [563, 563, 563], mov: 1000, delivery: 0 });
    expect(subtotal).toBe(1689);
  });

  it('adds no adjustment rows when the subtotal clears the MOV and there is no delivery', () => {
    const totals = computeBatchTotals({ lineTotals: [563, 563, 563], mov: 1000, delivery: 0 });
    expect(totals.adjustments).toEqual([]);
    expect(totals.totalAmount).toBe(totals.subtotal);
  });

  /* ── THE BUSINESS RULE: MOV APPLIES TO PRINTING, NOT THE INVOICE ──────── *
   * This is the test the checklist requires: ₦3,000 COMPUTED from inputs,
   * not read back from a fixture.                                          */
  describe('MOV applies to goods only', () => {
    const totals = () => computeBatchTotals({ lineTotals: [600], mov: 1000, delivery: 2000 });

    it('computes ₦3,000 for ₦600 of printing with ₦2,000 delivery', () => {
      expect(totals().totalAmount).toBe(3000);
    });

    it('does not let the delivery absorb the top-up (₦2,600 would be wrong)', () => {
      expect(totals().totalAmount).not.toBe(2600);
    });

    it('records the ₦400 top-up and the delivery as separate rows', () => {
      expect(totals().subtotal).toBe(600);
      expect(totals().adjustments).toEqual([
        { kind: 'mov', label: 'Minimum order adjustment', amount: 400 },
        { kind: 'delivery', label: 'Delivery', amount: 2000 },
      ]);
    });

    it('drops the top-up once the goods alone clear the minimum', () => {
      const cleared = computeBatchTotals({ lineTotals: [1200], mov: 1000, delivery: 2000 });
      expect(cleared.adjustments.map((a) => a.kind)).toEqual(['delivery']);
      expect(cleared.totalAmount).toBe(3200);
    });
  });

  it('charges nothing for an empty batch, delivery included', () => {
    expect(computeBatchTotals({ lineTotals: [], mov: 1000, delivery: 2000 })).toEqual({
      subtotal: 0,
      adjustments: [],
      totalAmount: 0,
    });
  });

  // The invariant the whole policy exists to produce.
  it('always satisfies subtotal + adjustments === totalAmount', () => {
    const cases = [
      { lineTotals: [563, 563, 563], mov: 1000, delivery: 0 },
      { lineTotals: [600], mov: 1000, delivery: 2000 },
      { lineTotals: [38], mov: 1000, delivery: 500 },
      { lineTotals: [10_000, 25], mov: 1000, delivery: 0 },
    ];
    for (const input of cases) {
      const { subtotal, adjustments, totalAmount } = computeBatchTotals(input);
      expect(adjustments.reduce((sum, a) => sum + a.amount, subtotal)).toBe(totalAmount);
      expect(Number.isInteger(totalAmount)).toBe(true);
    }
  });
});
