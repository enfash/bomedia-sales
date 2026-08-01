/**
 * Legacy sales migration — the PURE planning half.
 *
 *   Legacy:  sales/{recordId}                    = { material, total, amountPaid, batchId?, ... }
 *   Target:  sales/{YYYY}/{MM}/{DD}/{receiptId}  = StoredBatch (with items map)
 *
 * All decisions live here so they are unit-testable without touching Firebase.
 * `scripts/migrate-sales.ts` is a thin I/O shell around this: it reads, calls
 * `planLegacyMigration`, prints, and — only with --commit — writes.
 *
 * MONEY POLICY: this is a WRITE boundary, so the same rules as `createBatch`
 * apply. Line totals are rounded to whole naira, and `subtotal`/`adjustments[]`
 * come from `deriveLegacyMoneyFields` rather than being invented here. That is
 * exactly the backfill that shim was designed to permit — see utils/money.ts.
 */

import type { BatchAdjustment, StoredBatch, StoredItem } from '@/components/records/types';
import { deriveLegacyMoneyFields, roundNaira } from '@/utils/money';

/** A legacy flat record found somewhere under /sales. */
export interface LegacyLeaf {
  node: Record<string, any>;
  path: string[];
}

export interface PlannedBatch {
  batchId: string;
  /** Where the migrated batch will be written. */
  newPath: string;
  /** Every legacy node folded into this batch. */
  oldPaths: string[];
  node: StoredBatch;
  /** Sum of the line totals as they were stored, before rounding. */
  oldTotal: number;
  /** The batch total after the money policy is applied. */
  newTotal: number;
  adjustments: BatchAdjustment[];
}

export interface MigrationPlan {
  batches: PlannedBatch[];
  /** Records already in batch form — counted, never touched. */
  alreadyMigrated: number;
  legacyRecordCount: number;
  /** Sum of every legacy line total as stored. */
  grandTotalBefore: number;
  /** Sum of every migrated batch total. */
  grandTotalAfter: number;
  /** Non-zero means the migration would change the books. Must be surfaced. */
  grandTotalDelta: number;
}

export function isBatchNode(n: any): boolean {
  return (
    !!n && typeof n === 'object' && !!n.items && typeof n.items === 'object' &&
    !!(n.clientName || n.receiptId || n.createdAt)
  );
}

export function isLegacyRecord(n: any): boolean {
  return (
    !!n && typeof n === 'object' && !('items' in n) &&
    ('material' in n || 'width' in n || 'jobUnit' in n || 'total' in n)
  );
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Date bucket for the target path, from LOCAL calendar components — matching
 * `createBatch`, so a migrated sale lands in the same bucket a fresh one would.
 */
export function bucketFromDate(input?: string): string {
  const d = input ? new Date(input) : new Date();
  const safe = isNaN(d.getTime()) ? new Date() : d;
  return `${safe.getFullYear()}/${pad(safe.getMonth() + 1)}/${pad(safe.getDate())}`;
}

/** Walk the tree, collecting legacy leaves and counting already-migrated batches. */
export function collectLegacyLeaves(root: any): { leaves: LegacyLeaf[]; alreadyMigrated: number } {
  const leaves: LegacyLeaf[] = [];
  let alreadyMigrated = 0;

  const walk = (node: any, path: string[]) => {
    if (!node || typeof node !== 'object') return;
    // Already in the canonical shape — leave it exactly as it is. This is what
    // makes a second run a no-op.
    if (isBatchNode(node)) {
      alreadyMigrated++;
      return;
    }
    if (isLegacyRecord(node)) {
      leaves.push({ node, path });
      return;
    }
    for (const [k, child] of Object.entries(node)) walk(child, [...path, k]);
  };

  walk(root, []);
  return { leaves, alreadyMigrated };
}

/**
 * Build the full migration plan. Pure: same input, same output, no I/O.
 *
 * Returns an empty plan when there is nothing to do, which is the signal that
 * the migration is a no-op and the `adaptLegacyRecords` shim can be deleted.
 */
export function planLegacyMigration(root: any): MigrationPlan {
  const empty: MigrationPlan = {
    batches: [],
    alreadyMigrated: 0,
    legacyRecordCount: 0,
    grandTotalBefore: 0,
    grandTotalAfter: 0,
    grandTotalDelta: 0,
  };
  if (!root || typeof root !== 'object') return empty;

  const { leaves, alreadyMigrated } = collectLegacyLeaves(root);
  if (leaves.length === 0) return { ...empty, alreadyMigrated };

  interface Accum {
    batchId: string;
    base: Omit<StoredBatch, 'items'> & { items: Record<string, StoredItem> };
    /** Batch-level keys already taken from a record, so the first wins. */
    lifted: Set<keyof Accum['base']>;
    oldPaths: string[];
    rawLineTotals: number[];
    totalPaid: number;
  }

  const groups: Record<string, Accum> = {};

  for (const { node, path } of leaves) {
    const recordId = path[path.length - 1];
    const batchId = node.batchId || recordId;

    if (!groups[batchId]) {
      groups[batchId] = {
        batchId,
        base: {
          receiptId: batchId,
          clientName: 'Unknown Client',
          contact: '',
          createdAt: new Date().toISOString(),
          totalAmount: 0,
          deliveryCost: 0,
          totalPaid: 0,
          paymentMethod: 'Transfer',
          productionStage: 'Queued',
          items: {},
        },
        lifted: new Set(),
        oldPaths: [],
        rawLineTotals: [],
        totalPaid: 0,
      };
    }

    const group = groups[batchId];
    const index = Object.keys(group.base.items).length;

    // Batch-level fields: take the first non-empty value seen across the WHOLE
    // group, not just whatever the first record happened to carry. In this data
    // `productionStage` is set on one record of a pair and absent on the other,
    // so reading only the first would depend on key iteration order.
    const lift = (key: keyof Accum['base'], value: any) => {
      if (value === undefined || value === null || value === '') return;
      if (group.lifted.has(key)) return;
      (group.base as any)[key] = value;
      group.lifted.add(key);
    };
    lift('clientName', node.clientName);
    lift('contact', node.contact);
    lift('createdAt', node.createdAt);
    lift('paymentMethod', node.paymentMethod);
    lift('notes', node.notes);
    lift('dueDate', node.dueDate);
    // PRODUCTION STAGE IS BATCH-LEVEL. Without this it fell through into the
    // item spread below and the batch kept its 'Queued' default — which would
    // have put already-delivered jobs back on the board as not started.
    // `adaptLegacyRecords` reads it today, so dropping it here would be a
    // regression against what the app currently shows.
    lift('productionStage', node.productionStage);

    // Strip the batch-level fields off the item; they live on the batch node.
    const { batchId: _b, amountPaid, clientName, contact, createdAt, paymentMethod,
            notes, dueDate, productionStage, ...itemFields } = node;

    const rawTotal = Number(node.total) || 0;
    group.rawLineTotals.push(rawTotal);
    // Round at the write boundary, exactly as createBatch does.
    group.base.items[`item_${index}`] = { ...itemFields, total: roundNaira(rawTotal) } as StoredItem;
    group.totalPaid += Number(amountPaid) || 0;
    group.oldPaths.push(`sales/${path.join('/')}`);
  }

  const batches: PlannedBatch[] = [];
  let grandTotalBefore = 0;
  let grandTotalAfter = 0;

  for (const group of Object.values(groups)) {
    const oldTotal = group.rawLineTotals.reduce((sum, t) => sum + t, 0);

    // The batch total is the sum of the ROUNDED line totals — flat legacy
    // records carry no delivery and no separately-recorded adjustment, so the
    // subtotal is the total and any residual here is pure rounding drift.
    const roundedSum = group.rawLineTotals.reduce((sum, t) => sum + roundNaira(t), 0);
    const money = deriveLegacyMoneyFields({
      lineTotals: group.rawLineTotals,
      totalAmount: roundedSum,
      delivery: 0,
    });

    const node: StoredBatch = {
      ...group.base,
      subtotal: money.subtotal,
      adjustments: money.adjustments,
      totalAmount: money.totalAmount,
      totalPaid: roundNaira(group.totalPaid),
      deliveryCost: 0,
    };

    const newPath = `sales/${bucketFromDate(node.createdAt)}/${group.batchId}`;

    batches.push({
      batchId: group.batchId,
      newPath,
      oldPaths: group.oldPaths,
      node,
      oldTotal,
      newTotal: money.totalAmount,
      adjustments: money.adjustments,
    });

    grandTotalBefore += oldTotal;
    grandTotalAfter += money.totalAmount;
  }

  return {
    batches,
    alreadyMigrated,
    legacyRecordCount: leaves.length,
    grandTotalBefore,
    grandTotalAfter,
    grandTotalDelta: grandTotalAfter - grandTotalBefore,
  };
}

/**
 * Compare a batch node read back from the database against the one we planned.
 *
 * Used by the copy-then-VERIFY-then-delete sequence: the old records are only
 * removed once the new node is confirmed present and correct. Returns the list
 * of mismatched fields — empty means verified.
 */
export function verifyWrittenBatch(planned: StoredBatch, actual: any): string[] {
  const problems: string[] = [];
  if (!actual || typeof actual !== 'object') return ['node missing entirely'];

  const scalar: (keyof StoredBatch)[] = [
    'receiptId', 'clientName', 'createdAt', 'subtotal', 'totalAmount', 'totalPaid',
  ];
  for (const key of scalar) {
    if (actual[key] !== planned[key]) {
      problems.push(`${String(key)}: expected ${JSON.stringify(planned[key])}, found ${JSON.stringify(actual[key])}`);
    }
  }

  const plannedItems = Object.keys(planned.items ?? {});
  const actualItems = Object.keys(actual.items ?? {});
  if (plannedItems.length !== actualItems.length) {
    problems.push(`items: expected ${plannedItems.length}, found ${actualItems.length}`);
  } else {
    for (const key of plannedItems) {
      const p = planned.items![key];
      const a = actual.items?.[key];
      if (!a) problems.push(`items.${key}: missing`);
      else if (a.total !== p.total) {
        problems.push(`items.${key}.total: expected ${p.total}, found ${a.total}`);
      }
    }
  }

  const plannedAdj = planned.adjustments ?? [];
  const actualAdj = actual.adjustments ?? [];
  if (plannedAdj.length !== actualAdj.length) {
    problems.push(`adjustments: expected ${plannedAdj.length}, found ${actualAdj.length}`);
  }

  // The invariant the whole money policy exists to produce. If this fails the
  // node is internally inconsistent and must not replace the originals.
  const summed = actualAdj.reduce((sum: number, a: any) => sum + (a?.amount ?? 0), actual.subtotal ?? 0);
  if (summed !== actual.totalAmount) {
    problems.push(`subtotal + adjustments (${summed}) !== totalAmount (${actual.totalAmount})`);
  }

  return problems;
}
