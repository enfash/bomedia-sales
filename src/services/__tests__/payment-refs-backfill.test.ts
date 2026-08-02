import {
  isBackfillComplete,
  planPaymentRefBackfill,
} from '@/services/migrations/payment-refs-backfill';

const SALE = 'sales/2026/08/01/INV-A';

const entry = (over: Record<string, any> = {}) => ({
  amount: 5000, method: 'Cash', at: '2026-08-01T10:00:00Z', atMs: 1,
  byUid: 'uid-a', byName: 'Ada', receiptId: 'INV-A', batchPath: SALE, ...over,
});

const payments = (over: any = {}) => ({
  '2026-08-01': { 'uid-a': { '-K1': entry() } },
  ...over,
});

const sales = (refs?: Record<string, string>) => ({
  '2026': { '08': { '01': { 'INV-A': { clientName: 'Acme', totalPaid: 5000, ...(refs ? { paymentRefs: refs } : {}) } } } },
});

describe('planPaymentRefBackfill', () => {
  it('returns an empty plan for an empty ledger', () => {
    expect(planPaymentRefBackfill(null, sales()).updates).toEqual({});
    expect(planPaymentRefBackfill({}, sales()).ledgerEntryCount).toBe(0);
  });

  // The restore case: paid sales come back with no refs at all.
  it('writes the missing ref for a restored sale', () => {
    const plan = planPaymentRefBackfill(payments(), sales());
    expect(plan.updates).toEqual({ [`${SALE}/paymentRefs/-K1`]: '2026-08-01/uid-a' });
    expect(plan.salesTouched).toBe(1);
    expect(plan.ledgerEntryCount).toBe(1);
  });

  it('the ref value locates the entry it came from', () => {
    const plan = planPaymentRefBackfill(payments(), sales());
    const [[path, location]] = Object.entries(plan.updates);
    const key = path.split('/').pop();
    expect(`payments/${location}/${key}`).toBe('payments/2026-08-01/uid-a/-K1');
  });

  it('leaves a correct ref alone', () => {
    const plan = planPaymentRefBackfill(payments(), sales({ '-K1': '2026-08-01/uid-a' }));
    expect(plan.updates).toEqual({});
    expect(plan.alreadyCorrect).toBe(1);
  });

  // Idempotence: the whole reason it is safe to re-run.
  it('a second pass writes nothing', () => {
    const first = planPaymentRefBackfill(payments(), sales());
    const refs = Object.fromEntries(
      Object.entries(first.updates).map(([p, v]) => [p.split('/').pop()!, v]),
    );
    const second = planPaymentRefBackfill(payments(), sales(refs));
    expect(second.updates).toEqual({});
    expect(isBackfillComplete(second)).toBe(true);
  });

  it('reports a conflicting ref rather than overwriting it', () => {
    const plan = planPaymentRefBackfill(payments(), sales({ '-K1': '2026-07-30/uid-b' }));
    expect(plan.updates).toEqual({});
    expect(plan.conflicts).toEqual([
      { path: `${SALE}/paymentRefs/-K1`, existing: '2026-07-30/uid-b', expected: '2026-08-01/uid-a' },
    ]);
    expect(isBackfillComplete(plan)).toBe(false);
  });

  it('reports an entry whose sale no longer exists rather than writing a dangling ref', () => {
    const plan = planPaymentRefBackfill(payments(), { '2026': {} });
    expect(plan.updates).toEqual({});
    expect(plan.orphans).toEqual([{ key: '-K1', batchPath: SALE, amount: 5000 }]);
  });

  it('handles many entries across days, uids and sales', () => {
    const plan = planPaymentRefBackfill(
      {
        '2026-08-01': { 'uid-a': { '-K1': entry(), '-K2': entry({ amount: 100 }) } },
        '2026-08-02': { 'uid-b': { '-K3': entry({ byUid: 'uid-b' }) } },
      },
      sales(),
    );
    expect(Object.keys(plan.updates)).toHaveLength(3);
    expect(plan.updates[`${SALE}/paymentRefs/-K3`]).toBe('2026-08-02/uid-b');
    expect(plan.salesTouched).toBe(1);
  });

  it('skips malformed nodes without throwing', () => {
    const plan = planPaymentRefBackfill(
      { '2026-08-01': { 'uid-a': { '-K1': null, '-K2': 'nonsense', '-K3': entry() } } },
      sales(),
    );
    expect(plan.ledgerEntryCount).toBe(1);
    expect(Object.keys(plan.updates)).toEqual([`${SALE}/paymentRefs/-K3`]);
  });
});
