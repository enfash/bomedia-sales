/**
 * Sales repository — the single, typed entry point for reading and writing
 * sales data. Every screen and hook goes through here; no UI code should build
 * Firebase paths or sniff node shapes directly.
 *
 * Canonical storage layout (the ONLY format this app writes):
 *   sales/{YYYY}/{MM}/{DD}/{receiptId} -> StoredBatch
 *
 * Legacy flat records are tolerated on READ via the single, isolated
 * {@link adaptLegacyRecords} shim so no existing data disappears before the
 * migration runs. Delete that shim (and this note) once migrate-sales has been
 * run against production.
 */

import type {
  BatchAdjustment,
  JobUnit,
  PaymentMethod,
  ProductionStage,
  SalesBatch,
  SalesRecord,
  StoredBatch,
  StoredItem,
  TurnaroundTime,
} from '@/components/records/types';
import { dbService } from '@/services/db';
import { isOverdue } from '@/utils/date';
import { deriveLegacyMoneyFields, roundNaira } from '@/utils/money';
import { computePaymentStatus, STATUS_META } from '@/utils/payment-status';

const SALES_ROOT = 'sales';

/* ------------------------------------------------------------------ *
 * Normalization
 * ------------------------------------------------------------------ */

/** @internal Exported for unit tests; not part of the repository's public API. */
export function normalizeItem(raw: StoredItem, id: string, batchDbPath: string, batchId: string): SalesRecord {
  return {
    id,
    dbPath: `${batchDbPath}/items/${id}`,
    batchId,
    jobName: raw.jobName,
    material: raw.material ?? '',
    width: raw.width ?? '',
    height: raw.height ?? '',
    jobUnit: (raw.jobUnit ?? 'ft') as JobUnit,
    quantity: raw.quantity ?? 0,
    unitPrice: raw.unitPrice ?? 0,
    // Rounded on read as well as on write: line totals are whole naira from
    // here on, so pre-rounding data displays consistently with fresh sales and
    // the subtotal is the exact sum of the lines the customer is shown.
    total: roundNaira(raw.total ?? 0),
    eyelets: raw.eyelets,
    lamination: raw.lamination,
    turnaroundTime: raw.turnaroundTime as TurnaroundTime | undefined,
    type: raw.type,
  };
}

/**
 * Turn a raw batch node at a known path into a normalized SalesBatch.
 * @internal Exported for unit tests; not part of the repository's public API.
 */
export function normalizeBatch(node: StoredBatch, batchDbPath: string): SalesBatch {
  const batchId = batchDbPath.split('/').pop() || 'unknown';
  const records: SalesRecord[] = node.items
    ? Object.keys(node.items).map((k) => normalizeItem(node.items![k], k, batchDbPath, batchId))
    : [];

  // Money fields are a write-time snapshot. When they are absent the node
  // predates them, so reconstruct from the stored numbers alone — never from
  // live Settings, which would restate what the customer was charged.
  const money = node.subtotal != null && node.adjustments != null
    ? { subtotal: node.subtotal, adjustments: node.adjustments, totalAmount: node.totalAmount ?? 0 }
    : deriveLegacyMoneyFields({
        lineTotals: records.map((r) => r.total),
        totalAmount: node.totalAmount ?? 0,
        delivery: node.deliveryCost ?? 0,
      });

  const { subtotal, adjustments, totalAmount } = money;
  const totalPaid = node.totalPaid ?? 0;
  const status = computePaymentStatus(totalAmount, totalPaid, isOverdue(node.createdAt));

  return {
    id: batchId,
    receiptId: node.receiptId ?? batchId,
    dbPath: batchDbPath,
    clientName: node.clientName ?? 'Unknown Client',
    contact: node.contact,
    createdAt: node.createdAt ?? '',
    records,
    subtotal,
    adjustments,
    totalAmount,
    deliveryCost: node.deliveryCost,
    totalPaid,
    totalBalance: totalAmount - totalPaid,
    paymentMethod: node.paymentMethod,
    status,
    statusColor: STATUS_META[status].color,
    productionStage: (node.productionStage as ProductionStage) || 'Queued',
    notes: node.notes,
    dueDate: node.dueDate,
  };
}

/** A node is a batch iff it has an `items` map and at least one identifying field. */
function isBatchNode(node: any): node is StoredBatch {
  return (
    node && typeof node === 'object' &&
    typeof node.items === 'object' && node.items !== null &&
    (node.clientName || node.receiptId || node.createdAt)
  );
}

/**
 * Parse the entire `sales` tree into normalized batches. Walks the date-bucket
 * hierarchy to find batch nodes at any depth (2026/07/22/INV-...), then folds in
 * any legacy flat records via the isolated adapter.
 */
export function parseSalesTree(root: any): SalesBatch[] {
  if (!root || typeof root !== 'object') return [];

  const batches: SalesBatch[] = [];
  const legacyLeaves: { node: any; path: string[] }[] = [];

  const walk = (node: any, path: string[]) => {
    if (!node || typeof node !== 'object') return;
    if (isBatchNode(node)) {
      batches.push(normalizeBatch(node, `${SALES_ROOT}/${path.join('/')}`));
      return;
    }
    if (isLegacyRecordNode(node)) {
      legacyLeaves.push({ node, path });
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      walk(child, [...path, key]);
    }
  };

  walk(root, []);
  return [...batches, ...adaptLegacyRecords(legacyLeaves)];
}

/* ------------------------------------------------------------------ *
 * LEGACY SHIM — delete after running scripts/migrate-sales.mjs.
 * A flat record is an item stored directly (no wrapping batch node). We group
 * such records by batchId so they still render, and synthesize a batch path.
 * ------------------------------------------------------------------ */

function isLegacyRecordNode(node: any): boolean {
  return (
    node && typeof node === 'object' && !('items' in node) &&
    ('material' in node || 'width' in node || 'jobUnit' in node || 'total' in node)
  );
}

/** @internal Exported for unit tests; not part of the repository's public API. */
export function adaptLegacyRecords(leaves: { node: any; path: string[] }[]): SalesBatch[] {
  const groups: Record<string, SalesBatch> = {};

  for (const { node, path } of leaves) {
    const recordId = path[path.length - 1] || 'unknown';
    const dbPath = `${SALES_ROOT}/${path.join('/')}`;
    const batchId = node.batchId || recordId;

    const record: SalesRecord = {
      id: recordId,
      dbPath,
      batchId,
      material: node.material ?? '',
      width: node.width ?? '',
      height: node.height ?? '',
      jobUnit: (node.jobUnit ?? 'ft') as JobUnit,
      quantity: node.quantity ?? 0,
      unitPrice: node.unitPrice ?? 0,
      total: node.total ?? 0,
      loggedBy: node.loggedBy,
    };

    if (!groups[batchId]) {
      const status = computePaymentStatus(0, 0, isOverdue(node.createdAt));
      groups[batchId] = {
        id: batchId,
        dbPath,
        clientName: node.clientName ?? 'Unknown Client',
        contact: node.contact,
        createdAt: node.createdAt ?? '',
        records: [],
        subtotal: 0,
        adjustments: [],
        totalAmount: 0,
        totalPaid: 0,
        totalBalance: 0,
        status,
        statusColor: STATUS_META[status].color,
        productionStage: (node.productionStage as ProductionStage) || 'Queued',
        notes: node.notes,
        dueDate: node.dueDate,
      };
    }
    const batch = groups[batchId];
    batch.records.push(record);
    batch.totalAmount += record.total || 0;
    batch.totalPaid += node.amountPaid || 0;
  }

  return Object.values(groups).map((b) => {
    const status = computePaymentStatus(b.totalAmount, b.totalPaid, isOverdue(b.createdAt));
    // Flat legacy records carry no delivery or adjustment of any kind — the
    // batch total is purely the sum of its lines, so the subtotal is the total.
    const money = deriveLegacyMoneyFields({
      lineTotals: b.records.map((r) => r.total),
      totalAmount: b.totalAmount,
      delivery: 0,
    });
    return {
      ...b,
      subtotal: money.subtotal,
      adjustments: money.adjustments,
      totalAmount: money.totalAmount,
      totalBalance: money.totalAmount - b.totalPaid,
      status,
      statusColor: STATUS_META[status].color,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/** Subscribe to all sales as normalized batches. Returns an unsubscribe fn. */
export function subscribeToBatches(callback: (batches: SalesBatch[]) => void): () => void {
  return dbService.subscribe(SALES_ROOT, (root) => callback(parseSalesTree(root)));
}

/** One-shot fetch of specific batches by receiptId (used by the invoice screen). */
export async function fetchBatchesByReceiptIds(receiptIds: string[]): Promise<SalesBatch[]> {
  const root = await dbService.getRecord<any>(SALES_ROOT);
  const wanted = new Set(receiptIds);
  return parseSalesTree(root).filter((b) => wanted.has(b.id));
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

/** Generate a human-readable reference id, e.g. INV-260722-K4QP or QT-260722-9F2A. */
export function generateReceiptId(prefix = 'INV'): string {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${yy}${mm}${dd}-${rand}`;
}

export interface NewBatchInput {
  receiptId: string;
  clientName: string;
  contact?: string;
  /** Sum of the rounded line totals, from `computeBatchTotals`. */
  subtotal: number;
  /** Write-time snapshot, from `computeBatchTotals`. */
  adjustments: BatchAdjustment[];
  totalAmount: number;
  deliveryCost: number;
  totalPaid: number;
  paymentMethod: PaymentMethod;
  items: StoredItem[];
  notes?: string;
  dueDate?: string;
}

/** Persist a new sale under today's date bucket. Returns its dbPath. */
export async function createBatch(input: NewBatchInput): Promise<string> {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dbPath = `${SALES_ROOT}/${yyyy}/${mm}/${dd}/${input.receiptId}`;

  // Round at the write boundary: every line total stored is whole naira, so
  // the subtotal is the exact sum of what the invoice shows.
  const items: Record<string, StoredItem> = {};
  input.items.forEach((item, index) => {
    items[`item_${index}`] = { ...item, total: roundNaira(item.total ?? 0) };
  });

  const node: StoredBatch = {
    receiptId: input.receiptId,
    clientName: input.clientName,
    contact: input.contact ?? '',
    createdAt: now.toISOString(),
    // Numeric timestamp so security rules can enforce the staff 24h edit window.
    createdAtMs: now.getTime(),
    subtotal: roundNaira(input.subtotal),
    adjustments: input.adjustments,
    totalAmount: roundNaira(input.totalAmount),
    deliveryCost: roundNaira(input.deliveryCost),
    totalPaid: roundNaira(input.totalPaid),
    paymentMethod: input.paymentMethod,
    status: computePaymentStatus(input.totalAmount, input.totalPaid),
    productionStage: 'Queued',
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    items,
  };

  await dbService.setRecord(dbPath, node);
  return dbPath;
}

/** Move a job to a different production stage on the board. */
export async function updateProductionStage(
  batch: Pick<SalesBatch, 'dbPath'>,
  stage: ProductionStage,
): Promise<void> {
  await dbService.updateRecord(batch.dbPath, { productionStage: stage });
}

/** Add a payment to a batch (batch-level totalPaid). */
export async function recordPayment(batch: SalesBatch, amount: number): Promise<void> {
  const next = (batch.totalPaid || 0) + amount;
  await dbService.updateRecord(batch.dbPath, { totalPaid: next });
}

/** Mark one or more batches fully paid. */
export async function markBatchesPaid(batches: SalesBatch[]): Promise<void> {
  const updates: Record<string, number> = {};
  for (const batch of batches) {
    updates[`${batch.dbPath}/totalPaid`] = batch.totalAmount;
  }
  await dbService.updateRecord('/', updates);
}

/** Update editable batch details (notes / due date), across one or more batches. */
export async function updateBatchDetails(
  batches: Pick<SalesBatch, 'dbPath'>[],
  patch: { notes?: string; dueDate?: string },
): Promise<void> {
  const updates: Record<string, string> = {};
  for (const { dbPath } of batches) {
    if (patch.notes !== undefined) updates[`${dbPath}/notes`] = patch.notes;
    if (patch.dueDate !== undefined) updates[`${dbPath}/dueDate`] = patch.dueDate;
  }
  await dbService.updateRecord('/', updates);
}

/** Delete an entire batch. */
export async function deleteBatch(batch: Pick<SalesBatch, 'dbPath'>): Promise<void> {
  await dbService.removeRecord(batch.dbPath);
}
