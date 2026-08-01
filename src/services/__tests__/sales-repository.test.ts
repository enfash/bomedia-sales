/**
 * Unit tests for the normalizers in src/services/sales-repository.ts.
 *
 * Contains the ratcheted pair for audit §1.3 bug #2 (`dueDate` is ignored by
 * overdue logic). See docs/AUDIT_2026-07.md for the Stage 1 checklist.
 *
 * Only the pure normalizers are under test here — the read/write functions are
 * I/O and belong to a later stage.
 */

import type { StoredBatch } from '@/components/records/types';
import {
  adaptLegacyRecords,
  normalizeBatch,
  normalizeItem,
  parseSalesTree,
} from '@/services/sales-repository';
import { makeStoredBatch, makeStoredItem } from '@/test-support/factories';
import { STATUS_META } from '@/utils/payment-status';

// `sales-repository` imports `dbService` -> `@/lib/firebase`, which calls
// initializeApp() at module scope. The normalizers never touch it, so stub the
// module out and keep these tests genuinely pure (and offline).
// babel-plugin-jest-hoist lifts this above the imports above at compile time.
jest.mock('@/services/db', () => ({ dbService: {} }));

/**
 * Live MOV setting, swappable per test.
 *
 * `normalizeBatch` does not read settings today, so this mock is inert — it is
 * a tripwire. If a future implementation reaches for the MOV on read (to
 * recompute an adjustment rather than trusting the stored snapshot), the value
 * flows in through here and the immutability test below starts failing.
 * The `mock` name prefix is what lets the hoisted factory close over it.
 */
let mockMov = 1_000;
jest.mock('@/context/settings-context', () => ({
  useSettings: () => ({ mov: mockMov }),
}));

const NOW = new Date('2026-07-15T10:00:00+01:00');
const BATCH_PATH = 'sales/2026/07/15/INV-260715-AAAA';

/** ISO string for n days before the pinned "now". */
const daysBefore = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
/** ISO string for n days after the pinned "now". */
const daysAfter = (n: number) => new Date(NOW.getTime() + n * 24 * 60 * 60 * 1000).toISOString();

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
});

afterEach(() => {
  jest.useRealTimers();
  mockMov = 1_000;
});

describe('normalizeItem', () => {
  it('maps a stored item onto a normalized record with its db path', () => {
    const result = normalizeItem(makeStoredItem(), 'item_0', BATCH_PATH, 'INV-260715-AAAA');
    expect(result).toEqual({
      id: 'item_0',
      dbPath: `${BATCH_PATH}/items/item_0`,
      batchId: 'INV-260715-AAAA',
      jobName: 'Banner',
      material: 'Vinyl',
      width: '10',
      height: '4',
      jobUnit: 'ft',
      quantity: 1,
      unitPrice: 5000,
      total: 5000,
      eyelets: undefined,
      lamination: undefined,
      turnaroundTime: undefined,
      type: undefined,
    });
  });

  it('fills sensible defaults for missing fields', () => {
    const result = normalizeItem({}, 'item_0', BATCH_PATH, 'batch');
    expect(result.material).toBe('');
    expect(result.width).toBe('');
    expect(result.height).toBe('');
    expect(result.jobUnit).toBe('ft');
    expect(result.quantity).toBe(0);
    expect(result.unitPrice).toBe(0);
    expect(result.total).toBe(0);
  });

  it('preserves optional finishing flags when present', () => {
    const result = normalizeItem(
      makeStoredItem({ eyelets: true, lamination: false, turnaroundTime: 'Rush', type: 'Banner' }),
      'item_0',
      BATCH_PATH,
      'batch',
    );
    expect(result.eyelets).toBe(true);
    expect(result.lamination).toBe(false);
    expect(result.turnaroundTime).toBe('Rush');
    expect(result.type).toBe('Banner');
  });
});

describe('normalizeBatch', () => {
  it('maps a stored batch onto the normalized shape', () => {
    const result = normalizeBatch(makeStoredBatch(), BATCH_PATH);
    expect(result.id).toBe('INV-260715-AAAA');
    expect(result.receiptId).toBe('INV-260715-AAAA');
    expect(result.dbPath).toBe(BATCH_PATH);
    expect(result.clientName).toBe('Acme Signs');
    expect(result.totalAmount).toBe(50_000);
    expect(result.totalPaid).toBe(0);
    expect(result.productionStage).toBe('Queued');
  });

  it('derives the batch id from the last path segment', () => {
    const result = normalizeBatch(makeStoredBatch({ receiptId: undefined }), 'sales/2026/07/15/INV-ZZZ');
    expect(result.id).toBe('INV-ZZZ');
    expect(result.receiptId).toBe('INV-ZZZ');
  });

  it('turns the items map into an ordered records array', () => {
    const result = normalizeBatch(
      makeStoredBatch({
        items: {
          item_0: makeStoredItem({ jobName: 'Banner' }),
          item_1: makeStoredItem({ jobName: 'Sticker' }),
        },
      }),
      BATCH_PATH,
    );
    expect(result.records.map((r) => r.jobName)).toEqual(['Banner', 'Sticker']);
    expect(result.records[1].dbPath).toBe(`${BATCH_PATH}/items/item_1`);
  });

  it('returns an empty records array when there are no items', () => {
    expect(normalizeBatch(makeStoredBatch({ items: undefined }), BATCH_PATH).records).toEqual([]);
  });

  it('computes the outstanding balance', () => {
    const result = normalizeBatch(makeStoredBatch({ totalAmount: 50_000, totalPaid: 20_000 }), BATCH_PATH);
    expect(result.totalBalance).toBe(30_000);
  });

  it('derives status from the amounts, ignoring any stored status string', () => {
    const result = normalizeBatch(
      makeStoredBatch({ totalAmount: 50_000, totalPaid: 50_000, status: 'Unpaid' }),
      BATCH_PATH,
    );
    expect(result.status).toBe('Paid');
  });

  it('sources statusColor from STATUS_META', () => {
    const result = normalizeBatch(makeStoredBatch({ totalAmount: 50_000, totalPaid: 50_000 }), BATCH_PATH);
    expect(result.statusColor).toBe(STATUS_META.Paid.color);
  });

  it('falls back for missing client, totals and stage', () => {
    const result = normalizeBatch({}, BATCH_PATH);
    expect(result.clientName).toBe('Unknown Client');
    expect(result.createdAt).toBe('');
    expect(result.totalAmount).toBe(0);
    expect(result.totalPaid).toBe(0);
    expect(result.totalBalance).toBe(0);
    expect(result.productionStage).toBe('Queued');
  });

  it('carries notes and dueDate through untouched', () => {
    const result = normalizeBatch(
      makeStoredBatch({ notes: 'Call before delivery', dueDate: '2026-08-04' }),
      BATCH_PATH,
    );
    expect(result.notes).toBe('Call before delivery');
    expect(result.dueDate).toBe('2026-08-04');
  });

  /* ------------------------------------------------------------------ *
   * AUDIT §1.3 BUG #2 — `dueDate` is ignored by the overdue logic.
   *
   *   const status = computePaymentStatus(totalAmount, totalPaid,
   *                                       isOverdue(node.createdAt));
   *   // isOverdue(createdAt, thresholdDays = 7)
   *
   * Overdue is derived from a fixed 7-day window on `createdAt`. The `dueDate`
   * field is written, stored, editable in the UI — and never consulted. So a
   * sale given 30-day terms flags Overdue on day 8, and a sale whose 3-day
   * terms lapsed yesterday still looks fine.
   *
   * Ratchet pair — BOTH tests go red the moment the bug is fixed:
   *   A: `it.failing` asserting the CORRECT behaviour. Stage 1 flips it to `it`.
   *   B: plain `it` pinning TODAY'S WRONG status. Stage 1 deletes it.
   * ------------------------------------------------------------------ */
  describe('§1.3 bug #2 — overdue ignores dueDate', () => {
    /** Created 10 days ago, but not actually due for another 20 days. */
    const longTerms = (): StoredBatch =>
      makeStoredBatch({ createdAt: daysBefore(10), dueDate: daysAfter(20), totalAmount: 50_000, totalPaid: 0 });

    /** Created only 3 days ago, but the due date lapsed yesterday. */
    const lapsedTerms = (): StoredBatch =>
      makeStoredBatch({ createdAt: daysBefore(3), dueDate: daysBefore(1), totalAmount: 50_000, totalPaid: 0 });

    // A — the behaviour we want. Currently throws, so `it.failing` passes.
    // STAGE 1: flip `it.failing` -> `it`. No other edit.
    it('does not flag a batch whose dueDate is still 20 days out', () => {
      expect(normalizeBatch(longTerms(), BATCH_PATH).status).toBe('Unpaid');
    });

    // A — as above, the mirror case.
    // STAGE 1: flip `it.failing` -> `it`. No other edit.
    it('flags a batch whose dueDate lapsed yesterday', () => {
      expect(normalizeBatch(lapsedTerms(), BATCH_PATH).status).toBe('Overdue');
    });

    // B — the behaviour we have. Currently passes.
    // STAGE 1: delete this test.
    // The fallback path: no explicit dueDate, so terms come from the passed-in
    // threshold rather than a hardcoded 7 days.
    it('falls back to createdAt + defaultTermsDays when no dueDate is set', () => {
      const noDueDate = (): StoredBatch =>
        makeStoredBatch({ createdAt: daysBefore(10), dueDate: undefined, totalAmount: 50_000, totalPaid: 0 });

      // 10 days old, 30-day terms -> not yet due.
      expect(normalizeBatch(noDueDate(), BATCH_PATH, 30).status).toBe('Unpaid');
      // Same batch, 7-day terms -> overdue.
      expect(normalizeBatch(noDueDate(), BATCH_PATH, 7).status).toBe('Overdue');
    });

    it('lets an explicit dueDate win over the terms fallback', () => {
      // Long terms would say "not due", but the stored dueDate has lapsed.
      expect(normalizeBatch(lapsedTerms(), BATCH_PATH, 365).status).toBe('Overdue');
    });

    // Survives Stage 1: proves dueDate reaches the normalizer intact, so the
    // fault is that the status rule never reads it — not that it is missing.
    it('dueDate is present on the normalized batch even while unused', () => {
      const dueDate = daysAfter(20);
      expect(normalizeBatch(longTerms(), BATCH_PATH).dueDate).toBe(dueDate);
    });

    // Survives Stage 1: statusColor must stay consistent with whatever status
    // the rule produces, before and after the fix.
    it('statusColor stays consistent with the derived status', () => {
      const batch = normalizeBatch(longTerms(), BATCH_PATH);
      expect(batch.statusColor).toBe(STATUS_META[batch.status].color);
    });
  });

  /* ------------------------------------------------------------------ *
   * MONEY INVARIANT — an invoice must add up.
   *
   * Policy (decided for Stage 1, rule 2 as amended):
   *   1. Each LINE total is rounded to whole naira at write time.
   *   2. subtotal   = sum of the rounded line totals.
   *      totalAmount = subtotal + rounded adjustments.
   *   3. Neither subtotal nor totalAmount is ever rounded independently.
   * With that in place, `formatCurrency`'s rounding becomes a no-op safety net
   * rather than the thing papering over the drift (audit §1.3 bug #3).
   *
   * Fixture: ₦150/sqft x 3.75 sqft = ₦562.5 per line, three lines.
   *   today  -> lines of 562.5, batch 1687.5  (neither is whole naira)
   *   fixed  -> lines of 563,   subtotal 1689
   * Delivery is zero and there is no MOV top-up on this fixture, so it isolates
   * rounding from the adjustments.
   *
   * NOTE ON `subtotal` / `adjustments[]`: neither field exists on SalesBatch
   * yet. Stage 1 item 6 adds them BEFORE item 4 flips these ratchets —
   * see docs/AUDIT_2026-07.md. The tests below reference them through a local
   * widening type so intent is explicit and `tsc --noEmit` stays green until
   * the fields land; the ratchets fail on `undefined` in the meantime, which is
   * the correct signal.
   *
   * WHERE THIS CAN ACTUALLY BE FIXED: the line total is computed inline in
   * components/sales/job-detail-card.tsx (`currentTotal`, unrounded) and the
   * batch total in app/(tabs)/new-sales.tsx (`Math.max(subtotal, mov) + delivery`).
   * Neither is a pure function, so Stage 1 has to extract that arithmetic
   * before this invariant can be enforced at the point of writing. Until then
   * `normalizeBatch` is the only pure seam that sees both halves.
   *
   * Ratchet pair — BOTH tests go red once rounding-at-write lands.
   * ------------------------------------------------------------------ */
  describe('money invariant — rounded line totals sum to the batch total', () => {
    const UNIT_PRICE = 150; // naira per sqft
    const AREA_SQFT = 3.75;
    const LINE_TOTAL = UNIT_PRICE * AREA_SQFT; // 562.5
    const LINES = 3;

    /** A batch as the CURRENT write path stores it: nothing rounded anywhere. */
    const fractionalBatch = (): StoredBatch => {
      const items: Record<string, ReturnType<typeof makeStoredItem>> = {};
      for (let i = 0; i < LINES; i++) {
        items[`item_${i}`] = makeStoredItem({
          material: 'Vinyl',
          width: '2.5',
          height: '1.5',
          jobUnit: 'ft',
          quantity: 1,
          unitPrice: UNIT_PRICE,
          total: LINE_TOTAL,
        });
      }
      return makeStoredBatch({ items, totalAmount: LINE_TOTAL * LINES, totalPaid: 0 });
    };

    // A — the invariant we want. Currently throws, so `it.failing` passes.
    // STAGE 1: flip `it.failing` -> `it`. No other edit.
    it('every line total is a whole number of naira', () => {
      const batch = normalizeBatch(fractionalBatch(), BATCH_PATH);
      for (const record of batch.records) {
        expect(Number.isInteger(record.total)).toBe(true);
      }
    });

    // The same three lines as a batch written AFTER the fix: money fields
    // stored, nothing fractional anywhere.
    const freshBatch = (): StoredBatch => ({
      ...fractionalBatch(),
      items: {
        item_0: makeStoredItem({ unitPrice: UNIT_PRICE, total: 563 }),
        item_1: makeStoredItem({ unitPrice: UNIT_PRICE, total: 563 }),
        item_2: makeStoredItem({ unitPrice: UNIT_PRICE, total: 563 }),
      },
      subtotal: 1689,
      adjustments: [],
      totalAmount: 1689,
    });

    it('the subtotal equals the sum of the rounded line totals', () => {
      const batch = normalizeBatch(freshBatch(), BATCH_PATH);
      const summed = batch.records.reduce((sum, r) => sum + Math.round(r.total), 0);
      expect(batch.subtotal).toBe(summed);
      expect(Number.isInteger(batch.subtotal)).toBe(true);
    });

    it('totalAmount equals the subtotal when there are no adjustments', () => {
      const batch = normalizeBatch(freshBatch(), BATCH_PATH);
      expect(batch.adjustments).toEqual([]);
      expect(batch.totalAmount).toBe(batch.subtotal);
    });

    // The legacy path: the same money reconciles even though the node predates
    // the fields. 1689 rounded lines against a 1687.50 stored total, so the
    // ₦1.50 of drift surfaces as a rounded −₦1 row rather than vanishing.
    it('reconciles a pre-fix batch by surfacing its drift as an adjustment', () => {
      const batch = normalizeBatch(fractionalBatch(), BATCH_PATH);
      expect(batch.records.map((r) => r.total)).toEqual([563, 563, 563]);
      expect(batch.subtotal).toBe(1689);
      expect(batch.adjustments).toEqual([{ kind: 'legacy', label: 'Adjustment', amount: -1 }]);
      expect(batch.totalAmount).toBe(1688);
      expect(
        batch.adjustments.reduce((sum, a) => sum + a.amount, batch.subtotal),
      ).toBe(batch.totalAmount);
    });

    // Survives Stage 1: the arithmetic that makes this a real case, pinned so
    // the fixture cannot drift into something that rounds cleanly by accident.
    it('the fixture genuinely produces a half-naira line total', () => {
      expect(LINE_TOTAL).toBe(562.5);
      expect(Number.isInteger(LINE_TOTAL)).toBe(false);
    });
  });

  /* ------------------------------------------------------------------ *
   * BUSINESS RULE — MOV is a minimum on PRINTING, not on the invoice.
   *
   * Today's expression is `Math.max(batchSubtotal, mov) + delivery`, where
   * batchSubtotal is goods only. The `+ delivery` sitting OUTSIDE the max() is
   * what makes MOV apply to goods alone. That is correct and must be preserved.
   *
   * Worked case — ₦600 of printing, ₦2,000 delivery, ₦1,000 MOV:
   *   goods-only (CORRECT):  max(600, 1000) + 2000 = ₦3,000  -> ₦400 top-up
   *   invoice-wide  (WRONG): max(600 + 2000, 1000) = ₦2,600  -> no top-up
   *
   * The customer is charged ₦3,000. A big delivery must not let a tiny print
   * job dodge the minimum — delivery is pass-through, not printing revenue.
   *
   * STAGE 1: this must be an explicit, commented decision in money.ts, not an
   * accident of operator precedence that a later refactor can silently invert.
   * ------------------------------------------------------------------ */
  describe('MOV applies to printing only, not to the invoice total', () => {
    const GOODS = 600;
    const DELIVERY = 2_000;
    const MOV = 1_000;
    const MOV_TOPUP = MOV - GOODS; // 400
    const CHARGED = MOV + DELIVERY; // 3000

    /** A batch as the CURRENT write path stores it for this case. */
    const smallJobBigDelivery = (): StoredBatch =>
      makeStoredBatch({
        items: { item_0: makeStoredItem({ unitPrice: GOODS, quantity: 1, total: GOODS }) },
        deliveryCost: DELIVERY,
        // max(600, 1000) + 2000
        totalAmount: CHARGED,
        totalPaid: 0,
      });

    // PERMANENT — pins the charged figure through the read path.
    //
    // HONEST SCOPE: the fixture hard-codes totalAmount, because the MOV
    // expression lives in app/(tabs)/new-sales.tsx and no pure function
    // computes it. So this does NOT catch a regression in that expression — it
    // documents the case and guards the round-trip. The real guard is a
    // money.ts unit test in Stage 1, asserting the ₦3,000 is *computed*.
    it('carries the ₦3,000 charged on a ₦600 job with ₦2,000 delivery', () => {
      const batch = normalizeBatch(smallJobBigDelivery(), BATCH_PATH);
      expect(batch.totalAmount).toBe(3_000);
    });

    // PERMANENT — the rule as a specification, so the intent survives even if
    // every fixture here is rewritten. Arithmetic, not a guard on our code:
    // it fixes WHICH answer Stage 1's money.ts is required to produce.
    it('specifies goods-only (₦3,000) over invoice-wide (₦2,600)', () => {
      expect(Math.max(GOODS, MOV) + DELIVERY).toBe(3_000);
      expect(Math.max(GOODS + DELIVERY, MOV)).toBe(2_600);
    });

    // The adjustment breakdown behind that ₦3,000, as written after the fix.
    it('records the MOV top-up and delivery as separate adjustments', () => {
      const batch = normalizeBatch(
        {
          ...smallJobBigDelivery(),
          subtotal: GOODS,
          adjustments: [
            { kind: 'mov', label: 'Minimum order adjustment', amount: MOV_TOPUP },
            { kind: 'delivery', label: 'Delivery', amount: DELIVERY },
          ],
        },
        BATCH_PATH,
      );
      expect(batch.subtotal).toBe(GOODS);
      expect(batch.adjustments).toEqual([
        { kind: 'mov', label: 'Minimum order adjustment', amount: MOV_TOPUP },
        { kind: 'delivery', label: 'Delivery', amount: DELIVERY },
      ]);
      const adjusted = batch.adjustments.reduce((sum, a) => sum + a.amount, 0);
      expect(batch.subtotal + adjusted).toBe(CHARGED);
    });

    // The legacy path reaches the same total. It cannot know the ₦400 was a
    // minimum-order top-up — that fact was never stored — so it surfaces the
    // amount under a neutral label rather than inventing provenance.
    it('reconciles the same ₦3,000 on a pre-fix batch, labelled neutrally', () => {
      const batch = normalizeBatch(smallJobBigDelivery(), BATCH_PATH);
      expect(batch.subtotal).toBe(GOODS);
      expect(batch.adjustments).toEqual([
        { kind: 'delivery', label: 'Delivery', amount: DELIVERY },
        { kind: 'legacy', label: 'Adjustment', amount: MOV_TOPUP },
      ]);
      expect(batch.totalAmount).toBe(CHARGED);
    });
  });

  /* ------------------------------------------------------------------ *
   * `adjustments[]` IS AN IMMUTABLE SNAPSHOT.
   *
   * The amounts are priced once, at write time, and stored on the batch. They
   * are never recomputed from live Settings on read — otherwise raising the MOV
   * next quarter would silently restate every historic invoice, and a reprinted
   * receipt would not match the one the customer already paid against.
   *
   * `normalizeBatch` takes no settings argument today, so the guarantee holds
   * structurally. This pins it so a future "helpful" refactor cannot break it.
   * ------------------------------------------------------------------ */
  describe('adjustments are a write-time snapshot, never recomputed on read', () => {
    /** Written when the MOV setting was ₦500 — today's setting is ₦1,000. */
    const historicBatch = (): StoredBatch => ({
      ...makeStoredBatch({
        items: { item_0: makeStoredItem({ unitPrice: 300, quantity: 1, total: 300 }) },
        totalAmount: 500,
        totalPaid: 0,
      }),
      subtotal: 300,
      adjustments: [{ kind: 'mov', label: 'Minimum order adjustment', amount: 200 }],
    });

    it('preserves a historic ₦500 MOV top-up under a current ₦1,000 MOV', () => {
      const batch = normalizeBatch(historicBatch(), BATCH_PATH);
      expect(batch.subtotal).toBe(300);
      expect(batch.adjustments).toEqual([
        { kind: 'mov', label: 'Minimum order adjustment', amount: 200 },
      ]);
      // Recomputing against today's ₦1,000 MOV would give a ₦700 top-up.
      expect(batch.adjustments![0].amount).not.toBe(700);
      expect(batch.totalAmount).toBe(500);
    });

    // PERMANENT — the property itself, asserted behaviourally: the same stored
    // node must normalize identically under different live MOV settings.
    //
    // AMENDED FOR ITEM 3: the overdue threshold is now an input to
    // normalizeBatch, so the claim is "same node AND SAME THRESHOLD -> same
    // result". Both calls below pass TERMS explicitly. Without that this would
    // still pass, but only because both calls happened to take the same
    // default — it would stop testing the MOV property it exists for.
    it('returns the same result for one node under two different MOV settings', () => {
      const node = historicBatch();
      const TERMS = 7;

      mockMov = 500;
      const underOldMov = normalizeBatch(node, BATCH_PATH, TERMS);

      mockMov = 1_000;
      const underNewMov = normalizeBatch(node, BATCH_PATH, TERMS);

      // Whole-batch equality, so this covers adjustments[], subtotal and
      // totalAmount together.
      expect(underNewMov).toEqual(underOldMov);
      expect(underNewMov.adjustments).toEqual(
        underOldMov.adjustments,
      );
      expect(underNewMov.totalAmount).toBe(underOldMov.totalAmount);
    });

    // PERMANENT — proves the "same threshold" qualifier above is load-bearing.
    // The threshold DOES change the result, so holding it constant in the
    // tripwire is what isolates the MOV property. If this ever passes, the
    // tripwire has stopped testing anything.
    it('the threshold genuinely changes the result, so holding it fixed matters', () => {
      const node = makeStoredBatch({
        createdAt: daysBefore(10),
        dueDate: undefined,
        totalAmount: 50_000,
        totalPaid: 0,
      });
      expect(normalizeBatch(node, BATCH_PATH, 7).status).not.toBe(
        normalizeBatch(node, BATCH_PATH, 30).status,
      );
    });
  });
});

describe('parseSalesTree', () => {
  const tree = (batch: StoredBatch, id = 'INV-260715-AAAA') => ({
    '2026': { '07': { '15': { [id]: batch } } },
  });

  it('returns an empty array for a null or non-object root', () => {
    expect(parseSalesTree(null)).toEqual([]);
    expect(parseSalesTree(undefined)).toEqual([]);
    expect(parseSalesTree('nonsense')).toEqual([]);
    expect(parseSalesTree(42)).toEqual([]);
  });

  it('returns an empty array for an empty tree', () => {
    expect(parseSalesTree({})).toEqual([]);
  });

  it('walks the YYYY/MM/DD buckets and normalizes the batch at the leaf', () => {
    const result = parseSalesTree(tree(makeStoredBatch()));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('INV-260715-AAAA');
    expect(result[0].dbPath).toBe('sales/2026/07/15/INV-260715-AAAA');
  });

  it('finds batches across several days and months', () => {
    const result = parseSalesTree({
      '2026': {
        '06': { '30': { 'INV-A': makeStoredBatch({ receiptId: 'INV-A' }) } },
        '07': {
          '14': { 'INV-B': makeStoredBatch({ receiptId: 'INV-B' }) },
          '15': { 'INV-C': makeStoredBatch({ receiptId: 'INV-C' }) },
        },
      },
    });
    expect(result.map((b) => b.id).sort()).toEqual(['INV-A', 'INV-B', 'INV-C']);
  });

  it('builds the db path from the full bucket path', () => {
    const result = parseSalesTree({ '2026': { '06': { '30': { 'INV-A': makeStoredBatch() } } } });
    expect(result[0].dbPath).toBe('sales/2026/06/30/INV-A');
  });

  it('falls through to the legacy adapter for a batch with no identifying field', () => {
    // `isBatchNode` requires clientName/receiptId/createdAt alongside `items`.
    // Without one, the walk descends INTO `items` and each line item then
    // satisfies `isLegacyRecordNode`, so it is adapted as a flat record rather
    // than skipped. Characterizing the real behaviour, not asserting an ideal.
    const result = parseSalesTree({
      '2026': { '07': { '15': { 'INV-X': { items: { item_0: makeStoredItem() } } } } },
    });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('item_0');
    expect(result[0].dbPath).toBe('sales/2026/07/15/INV-X/items/item_0');
    expect(result[0].totalAmount).toBe(5_000);
  });

  it('treats a node with items and only a createdAt as a batch', () => {
    const result = parseSalesTree({
      '2026': { '07': { '15': { 'INV-X': { createdAt: daysBefore(1), items: { item_0: makeStoredItem() } } } } },
    });
    expect(result).toHaveLength(1);
    expect(result[0].clientName).toBe('Unknown Client');
  });

  it('skips primitive values encountered during the walk', () => {
    const result = parseSalesTree({
      '2026': { '07': { '15': { 'INV-A': makeStoredBatch() } } },
      lastSyncedAt: 1_770_000_000_000,
      note: 'a stray string',
    });
    expect(result).toHaveLength(1);
  });
});

describe('adaptLegacyRecords (pre-migration shim)', () => {
  const legacyLeaf = (node: Record<string, unknown>, path: string[]) => ({ node, path });

  it('returns an empty array for no leaves', () => {
    expect(adaptLegacyRecords([])).toEqual([]);
  });

  it('turns a flat record into a synthesized single-item batch', () => {
    const result = adaptLegacyRecords([
      legacyLeaf(
        { material: 'Vinyl', width: '10', height: '4', jobUnit: 'ft', quantity: 1, unitPrice: 5_000, total: 5_000, clientName: 'Acme' },
        ['2026', '07', '15', 'rec_1'],
      ),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('rec_1');
    expect(result[0].clientName).toBe('Acme');
    expect(result[0].dbPath).toBe('sales/2026/07/15/rec_1');
    expect(result[0].records).toHaveLength(1);
    expect(result[0].totalAmount).toBe(5_000);
  });

  it('groups several records sharing a batchId into one batch', () => {
    const result = adaptLegacyRecords([
      legacyLeaf({ material: 'Vinyl', total: 5_000, batchId: 'B1', clientName: 'Acme' }, ['2026', '07', '15', 'rec_1']),
      legacyLeaf({ material: 'SAV', total: 3_000, batchId: 'B1' }, ['2026', '07', '15', 'rec_2']),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('B1');
    expect(result[0].records).toHaveLength(2);
    expect(result[0].totalAmount).toBe(8_000);
  });

  it('keeps records with different batchIds apart', () => {
    const result = adaptLegacyRecords([
      legacyLeaf({ material: 'Vinyl', total: 5_000, batchId: 'B1' }, ['2026', '07', '15', 'rec_1']),
      legacyLeaf({ material: 'SAV', total: 3_000, batchId: 'B2' }, ['2026', '07', '15', 'rec_2']),
    ]);
    expect(result.map((b) => b.id).sort()).toEqual(['B1', 'B2']);
  });

  it('sums amountPaid across the grouped records and derives the balance', () => {
    const result = adaptLegacyRecords([
      legacyLeaf({ material: 'Vinyl', total: 5_000, amountPaid: 2_000, batchId: 'B1' }, ['2026', '07', '15', 'rec_1']),
      legacyLeaf({ material: 'SAV', total: 3_000, amountPaid: 1_000, batchId: 'B1' }, ['2026', '07', '15', 'rec_2']),
    ]);
    expect(result[0].totalPaid).toBe(3_000);
    expect(result[0].totalBalance).toBe(5_000);
    expect(result[0].status).toBe('Partial');
  });

  it('recomputes status once the group total is known', () => {
    const result = adaptLegacyRecords([
      legacyLeaf({ material: 'Vinyl', total: 5_000, amountPaid: 5_000, batchId: 'B1' }, ['2026', '07', '15', 'rec_1']),
    ]);
    expect(result[0].status).toBe('Paid');
    expect(result[0].statusColor).toBe(STATUS_META.Paid.color);
  });

  it('fills defaults for a sparse legacy record', () => {
    const result = adaptLegacyRecords([legacyLeaf({ total: 1_000 }, ['2026', '07', '15', 'rec_1'])]);
    expect(result[0].clientName).toBe('Unknown Client');
    expect(result[0].productionStage).toBe('Queued');
    expect(result[0].records[0].jobUnit).toBe('ft');
    expect(result[0].records[0].material).toBe('');
  });

  it('carries loggedBy onto the normalized record', () => {
    const result = adaptLegacyRecords([
      legacyLeaf({ material: 'Vinyl', total: 1_000, loggedBy: 'operator' }, ['2026', '07', '15', 'rec_1']),
    ]);
    expect(result[0].records[0].loggedBy).toBe('operator');
  });
});

describe('parseSalesTree with legacy records', () => {
  it('folds flat legacy records in alongside canonical batches', () => {
    const result = parseSalesTree({
      '2026': {
        '07': {
          '15': {
            'INV-A': makeStoredBatch({ receiptId: 'INV-A' }),
            rec_1: { material: 'Vinyl', total: 3_000, clientName: 'Legacy Co' },
          },
        },
      },
    });
    expect(result).toHaveLength(2);
    expect(result.map((b) => b.id).sort()).toEqual(['INV-A', 'rec_1']);
  });

  it('places canonical batches before adapted legacy ones', () => {
    const result = parseSalesTree({
      '2026': {
        '07': {
          '15': {
            rec_1: { material: 'Vinyl', total: 3_000 },
            'INV-A': makeStoredBatch({ receiptId: 'INV-A' }),
          },
        },
      },
    });
    expect(result[0].id).toBe('INV-A');
    expect(result[1].id).toBe('rec_1');
  });
});
