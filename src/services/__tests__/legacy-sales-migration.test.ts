/**
 * Tests for the pure half of the legacy sales migration.
 *
 * The point of splitting the planner out of the script is that the risky
 * decisions — what gets written, what gets deleted, whether the books move —
 * can be proven here rather than discovered against production data.
 */

import {
  bucketFromDate,
  collectLegacyLeaves,
  isBatchNode,
  isLegacyRecord,
  planLegacyMigration,
  verifyWrittenBatch,
} from '@/services/migrations/legacy-sales-migration';

/** A legacy flat record, as written before the hierarchical layout existed. */
const legacyRecord = (over: Record<string, any> = {}) => ({
  material: 'Vinyl',
  width: '10',
  height: '4',
  jobUnit: 'ft',
  quantity: 1,
  unitPrice: 5000,
  total: 5000,
  amountPaid: 0,
  clientName: 'Acme Signs',
  createdAt: '2026-07-15T10:00:00+01:00',
  ...over,
});

/** Applies a plan to a tree the way the script does, so we can re-plan on it. */
function applyPlan(root: any, plan: ReturnType<typeof planLegacyMigration>) {
  const next = JSON.parse(JSON.stringify(root));

  const setPath = (segments: string[], value: any) => {
    let cursor = next;
    for (const key of segments.slice(0, -1)) {
      cursor[key] = cursor[key] ?? {};
      cursor = cursor[key];
    }
    cursor[segments[segments.length - 1]] = value;
  };
  const deletePath = (segments: string[]) => {
    let cursor = next;
    for (const key of segments.slice(0, -1)) {
      if (!cursor[key]) return;
      cursor = cursor[key];
    }
    delete cursor[segments[segments.length - 1]];
  };

  for (const batch of plan.batches) {
    setPath(batch.newPath.split('/').slice(1), batch.node);
    for (const old of batch.oldPaths) {
      if (old !== batch.newPath) deletePath(old.split('/').slice(1));
    }
  }
  return next;
}

describe('collectLegacyLeaves', () => {
  it('separates legacy leaves from already-canonical batches in one walk', () => {
    const { leaves, alreadyMigrated } = collectLegacyLeaves({
      rec_1: legacyRecord(),
      '2026': { '07': { '15': { 'INV-1': { clientName: 'Acme', items: { item_0: {} } } } } },
    });
    expect(leaves.map((l) => l.path.join('/'))).toEqual(['rec_1']);
    expect(alreadyMigrated).toBe(1);
  });

  it('does not descend into a batch node and mistake its items for legacy records', () => {
    const { leaves } = collectLegacyLeaves({
      '2026': { '07': { '15': { 'INV-1': {
        clientName: 'Acme',
        items: { item_0: { material: 'Vinyl', total: 5000 } },
      } } } },
    });
    expect(leaves).toEqual([]);
  });
});

describe('node classification', () => {
  it('recognises a canonical batch node', () => {
    expect(isBatchNode({ items: {}, clientName: 'Acme' })).toBe(true);
  });

  it('does not mistake a legacy record for a batch', () => {
    expect(isBatchNode(legacyRecord())).toBe(false);
    expect(isLegacyRecord(legacyRecord())).toBe(true);
  });

  it('does not mistake a date bucket for either', () => {
    expect(isBatchNode({ '15': {} })).toBe(false);
    expect(isLegacyRecord({ '15': {} })).toBe(false);
  });
});

describe('bucketFromDate', () => {
  it('buckets on local calendar components, matching createBatch', () => {
    expect(bucketFromDate('2026-07-15T10:00:00+01:00')).toBe('2026/07/15');
  });

  it('keeps a 00:30 WAT record on its local day rather than the previous UTC one', () => {
    expect(bucketFromDate('2026-07-15T00:30:00+01:00')).toBe('2026/07/15');
  });

  it('zero-pads single-digit months and days', () => {
    expect(bucketFromDate('2026-01-05T10:00:00+01:00')).toBe('2026/01/05');
  });
});

describe('planLegacyMigration', () => {
  it('returns an empty plan for an empty or missing tree', () => {
    for (const root of [null, undefined, {}, 'nonsense']) {
      const plan = planLegacyMigration(root);
      expect(plan.batches).toEqual([]);
      expect(plan.legacyRecordCount).toBe(0);
    }
  });

  it('moves a flat record to its date bucket', () => {
    const plan = planLegacyMigration({ rec_1: legacyRecord() });
    expect(plan.legacyRecordCount).toBe(1);
    expect(plan.batches).toHaveLength(1);
    expect(plan.batches[0].oldPaths).toEqual(['sales/rec_1']);
    expect(plan.batches[0].newPath).toBe('sales/2026/07/15/rec_1');
  });

  it('groups records sharing a batchId into one batch', () => {
    const plan = planLegacyMigration({
      rec_1: legacyRecord({ batchId: 'INV-1', total: 5000 }),
      rec_2: legacyRecord({ batchId: 'INV-1', total: 3000 }),
    });
    expect(plan.batches).toHaveLength(1);
    expect(Object.keys(plan.batches[0].node.items!)).toEqual(['item_0', 'item_1']);
    expect(plan.batches[0].oldPaths).toEqual(['sales/rec_1', 'sales/rec_2']);
    expect(plan.batches[0].newTotal).toBe(8000);
  });

  it('sums amountPaid across the grouped records', () => {
    const plan = planLegacyMigration({
      rec_1: legacyRecord({ batchId: 'INV-1', amountPaid: 2000 }),
      rec_2: legacyRecord({ batchId: 'INV-1', amountPaid: 500 }),
    });
    expect(plan.batches[0].node.totalPaid).toBe(2500);
  });

  it('writes subtotal and adjustments, so migrated nodes are canonical', () => {
    const plan = planLegacyMigration({ rec_1: legacyRecord({ total: 5000 }) });
    const node = plan.batches[0].node;
    expect(node.subtotal).toBe(5000);
    expect(node.adjustments).toEqual([]);
    expect(node.totalAmount).toBe(5000);
  });

  it('rounds line totals at the write boundary', () => {
    const plan = planLegacyMigration({ rec_1: legacyRecord({ total: 562.5 }) });
    expect(plan.batches[0].node.items!.item_0.total).toBe(563);
    expect(plan.batches[0].node.subtotal).toBe(563);
  });

  it('keeps every migrated node internally consistent', () => {
    const plan = planLegacyMigration({
      a: legacyRecord({ batchId: 'INV-1', total: 562.5 }),
      b: legacyRecord({ batchId: 'INV-1', total: 562.5 }),
      c: legacyRecord({ batchId: 'INV-2', total: 1000 }),
    });
    for (const batch of plan.batches) {
      const summed = (batch.node.adjustments ?? []).reduce((s, a) => s + a.amount, batch.node.subtotal!);
      expect(summed).toBe(batch.node.totalAmount);
      expect(Number.isInteger(batch.node.totalAmount)).toBe(true);
    }
  });

  /* ---------------------------------------------------------------- *
   * BATCH-LEVEL FIELDS MUST NOT FALL THROUGH ONTO THE ITEM.
   *
   * `productionStage` is batch-level in the canonical model. An earlier version
   * of this planner hardcoded 'Queued' on the batch and let the raw value land
   * in the item spread, where nothing reads it — which would have put already-
   * delivered jobs back on the board as not started. `adaptLegacyRecords` reads
   * it correctly today, so losing it here would regress against what the app
   * currently shows.
   * ---------------------------------------------------------------- */
  describe('batch-level fields', () => {
    it('carries productionStage onto the batch, not the item', () => {
      const plan = planLegacyMigration({
        rec_1: legacyRecord({ productionStage: 'Delivered' }),
      });
      expect(plan.batches[0].node.productionStage).toBe('Delivered');
      expect((plan.batches[0].node.items!.item_0 as any).productionStage).toBeUndefined();
    });

    it('defaults to Queued only when no record carries a stage', () => {
      const plan = planLegacyMigration({ rec_1: legacyRecord({ productionStage: undefined }) });
      expect(plan.batches[0].node.productionStage).toBe('Queued');
    });

    // The real shape of this data: one record of a pair has the stage, the
    // other does not. Reading only the first record would make the result
    // depend on key iteration order.
    it('finds the stage on ANY record of a group, not just the first', () => {
      const stageOnSecond = planLegacyMigration({
        a: legacyRecord({ batchId: 'INV-1', productionStage: undefined }),
        b: legacyRecord({ batchId: 'INV-1', productionStage: 'Delivered' }),
      });
      expect(stageOnSecond.batches[0].node.productionStage).toBe('Delivered');

      const stageOnFirst = planLegacyMigration({
        a: legacyRecord({ batchId: 'INV-1', productionStage: 'Delivered' }),
        b: legacyRecord({ batchId: 'INV-1', productionStage: undefined }),
      });
      expect(stageOnFirst.batches[0].node.productionStage).toBe('Delivered');
    });

    it('lifts notes and dueDate from whichever record carries them', () => {
      const plan = planLegacyMigration({
        a: legacyRecord({ batchId: 'INV-1' }),
        b: legacyRecord({ batchId: 'INV-1', notes: 'Thank you', dueDate: 'August 1 2026' }),
      });
      expect(plan.batches[0].node.notes).toBe('Thank you');
      expect(plan.batches[0].node.dueDate).toBe('August 1 2026');
    });

    it('keeps the first non-empty value when records disagree', () => {
      const plan = planLegacyMigration({
        a: legacyRecord({ batchId: 'INV-1', clientName: 'Acme Signs' }),
        b: legacyRecord({ batchId: 'INV-1', clientName: 'Someone Else' }),
      });
      expect(plan.batches[0].node.clientName).toBe('Acme Signs');
    });

    it('writes no bookkeeping keys onto the node', () => {
      const plan = planLegacyMigration({ rec_1: legacyRecord() });
      for (const key of Object.keys(plan.batches[0].node)) {
        expect(key.startsWith('__')).toBe(false);
        expect(key).not.toBe('lifted');
      }
    });
  });

  it('leaves already-migrated batches alone and counts them', () => {
    const plan = planLegacyMigration({
      '2026': { '07': { '15': { 'INV-1': { clientName: 'Acme', items: { item_0: {} } } } } },
    });
    expect(plan.alreadyMigrated).toBe(1);
    expect(plan.batches).toEqual([]);
  });

  /* ---------------------------------------------------------------- *
   * THE BOOKS MUST NOT MOVE.
   * ---------------------------------------------------------------- */
  describe('grand total conservation', () => {
    it('reports a zero delta when every total is already whole naira', () => {
      const plan = planLegacyMigration({
        a: legacyRecord({ total: 5000 }),
        b: legacyRecord({ total: 3000 }),
        c: legacyRecord({ total: 1250 }),
      });
      expect(plan.grandTotalBefore).toBe(9250);
      expect(plan.grandTotalAfter).toBe(9250);
      expect(plan.grandTotalDelta).toBe(0);
    });

    // Rounding CAN move the aggregate. The plan surfaces it as a number rather
    // than hiding it — the script prints it loudly when non-zero.
    it('reports a non-zero delta when rounding shifts the aggregate', () => {
      const plan = planLegacyMigration({
        a: legacyRecord({ batchId: 'INV-1', total: 0.4 }),
        b: legacyRecord({ batchId: 'INV-2', total: 0.4 }),
      });
      expect(plan.grandTotalBefore).toBeCloseTo(0.8);
      expect(plan.grandTotalAfter).toBe(0);
      expect(plan.grandTotalDelta).toBeCloseTo(-0.8);
    });

    it('never silently reports zero when the totals actually differ', () => {
      const plan = planLegacyMigration({ a: legacyRecord({ total: 562.5 }) });
      expect(plan.grandTotalAfter - plan.grandTotalBefore).toBe(plan.grandTotalDelta);
      expect(plan.grandTotalDelta).toBeCloseTo(0.5);
    });
  });

  /* ---------------------------------------------------------------- *
   * IDEMPOTENCE — re-running after a successful commit writes nothing.
   * ---------------------------------------------------------------- */
  describe('idempotence', () => {
    const root = () => ({
      rec_1: legacyRecord({ batchId: 'INV-1', total: 5000 }),
      rec_2: legacyRecord({ batchId: 'INV-1', total: 562.5 }),
      rec_3: legacyRecord({ total: 1200, createdAt: '2026-06-02T09:00:00+01:00' }),
    });

    it('plans work on the first pass', () => {
      const plan = planLegacyMigration(root());
      expect(plan.batches.length).toBeGreaterThan(0);
      expect(plan.legacyRecordCount).toBe(3);
    });

    it('plans NOTHING on a second pass over the migrated tree', () => {
      const first = planLegacyMigration(root());
      const migrated = applyPlan(root(), first);

      const second = planLegacyMigration(migrated);
      expect(second.batches).toEqual([]);
      expect(second.legacyRecordCount).toBe(0);
      expect(second.grandTotalDelta).toBe(0);
      // The migrated batches are recognised as canonical, not re-collected.
      expect(second.alreadyMigrated).toBe(first.batches.length);
    });

    it('a third pass is also a no-op', () => {
      const first = planLegacyMigration(root());
      const once = applyPlan(root(), first);
      const twice = applyPlan(once, planLegacyMigration(once));
      expect(planLegacyMigration(twice).batches).toEqual([]);
    });

    it('the old flat nodes are gone and the new ones are in place', () => {
      const start = root();
      const migrated: any = applyPlan(start, planLegacyMigration(start));
      expect(migrated.rec_1).toBeUndefined();
      expect(migrated.rec_2).toBeUndefined();
      expect(migrated.rec_3).toBeUndefined();
      expect(migrated['2026']['07']['15']['INV-1']).toBeDefined();
      expect(migrated['2026']['06']['02']['rec_3']).toBeDefined();
    });
  });
});

describe('verifyWrittenBatch', () => {
  const planned = () => planLegacyMigration({ rec_1: legacyRecord({ total: 5000 }) }).batches[0].node;

  it('passes when the read-back node matches', () => {
    const node = planned();
    expect(verifyWrittenBatch(node, JSON.parse(JSON.stringify(node)))).toEqual([]);
  });

  it('fails loudly when the node is missing entirely', () => {
    expect(verifyWrittenBatch(planned(), null)).toEqual(['node missing entirely']);
  });

  it('catches a changed total', () => {
    const actual = { ...JSON.parse(JSON.stringify(planned())), totalAmount: 4999 };
    expect(verifyWrittenBatch(planned(), actual).join(' ')).toMatch(/totalAmount/);
  });

  it('catches a dropped item', () => {
    const actual = JSON.parse(JSON.stringify(planned()));
    delete actual.items.item_0;
    expect(verifyWrittenBatch(planned(), actual).join(' ')).toMatch(/items/);
  });

  it('catches a node that does not add up, even if nothing else changed', () => {
    const actual = JSON.parse(JSON.stringify(planned()));
    actual.subtotal = 4000; // totalAmount still 5000, adjustments still empty
    expect(verifyWrittenBatch(planned(), actual).join(' ')).toMatch(/!== totalAmount/);
  });
});
