/**
 * Sales repository — the single, typed entry point for reading and writing
 * sales data. Every screen and hook goes through here; no UI code should build
 * Firebase paths or sniff node shapes directly.
 *
 * Canonical storage layout (the ONLY format this app writes):
 *   sales/{YYYY}/{MM}/{DD}/{receiptId} -> StoredBatch
 *
 * There is no legacy read path. The pre-migration `adaptLegacyRecords` shim was
 * removed on 2026-08-01 when the database was wiped and restarted clean — every
 * record now in `sales` was written by {@link createBatch} in the canonical
 * layout, with `subtotal` and `adjustments[]` always present.
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
import { buildPaymentWrite, type PaymentActor } from '@/services/payment-repository';
import { isPastDue, localDayKey } from '@/utils/date';
import { roundNaira } from '@/utils/money';
import { computePaymentStatus, STATUS_META } from '@/utils/payment-status';

const SALES_ROOT = 'sales';

/**
 * Fallback payment terms, used only when no caller supplies the Settings value.
 * Matches the pre-item-3 hardcoded window, so behaviour is unchanged for any
 * call site that has not been threaded through yet.
 */
const DEFAULT_TERMS_DAYS = 7;

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
export function normalizeBatch(
  node: StoredBatch,
  batchDbPath: string,
  defaultTermsDays = DEFAULT_TERMS_DAYS,
): SalesBatch {
  const batchId = batchDbPath.split('/').pop() || 'unknown';
  const records: SalesRecord[] = node.items
    ? Object.keys(node.items).map((k) => normalizeItem(node.items![k], k, batchDbPath, batchId))
    : [];

  // INVARIANT: every stored batch carries `subtotal` and `adjustments[]`,
  // because `createBatch` is the only writer and always writes them.
  //
  // The defaults below exist for one case only: a device still running a build
  // from before those fields were added. Defaulting `subtotal` to `totalAmount`
  // (rather than 0) keeps `subtotal + adjustments === totalAmount` true even
  // then, so the detail screen and invoice still reconcile.
  const totalAmount = node.totalAmount ?? 0;
  const subtotal = node.subtotal ?? totalAmount;
  const adjustments = node.adjustments ?? [];
  const totalPaid = node.totalPaid ?? 0;
  // Overdue is driven by dueDate, falling back to createdAt + terms. The
  // threshold is passed in rather than read from Settings, so this stays a
  // pure function of its arguments.
  const status = computePaymentStatus(
    totalAmount,
    totalPaid,
    isPastDue(node.createdAt, node.dueDate, defaultTermsDays),
  );

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
    isVoided: node.voidedAtMs != null,
    voidedAt: node.voidedAt,
    voidedByName: node.voidedByName,
    voidReason: node.voidReason,
    // Passed through as stored, including absent. A batch written before
    // attribution existed is UNKNOWN, and the UI must say so rather than
    // defaulting to a name — which is the bug this replaced.
    loggedByUid: node.loggedByUid,
    loggedByName: node.loggedByName,
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
 * hierarchy to find batch nodes at any depth (2026/07/22/INV-...).
 */
export function parseSalesTree(root: any, defaultTermsDays = DEFAULT_TERMS_DAYS): SalesBatch[] {
  if (!root || typeof root !== 'object') return [];

  const batches: SalesBatch[] = [];

  const walk = (node: any, path: string[]) => {
    if (!node || typeof node !== 'object') return;
    if (isBatchNode(node)) {
      batches.push(normalizeBatch(node, `${SALES_ROOT}/${path.join('/')}`, defaultTermsDays));
      return;
    }
    // Not a batch and not a bucket we recognise — descend, and if there is
    // nothing batch-shaped below, it is simply ignored.
    for (const [key, child] of Object.entries(node)) {
      walk(child, [...path, key]);
    }
  };

  walk(root, []);
  return batches;
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/**
 * Subscribe to all sales as normalized batches. Returns an unsubscribe fn.
 *
 * Voided sales are EXCLUDED by default. Pass `includeVoided` only where a
 * voided record must remain reachable — the Records "Voided" filter and the
 * transaction detail screen.
 */
export function subscribeToBatches(
  callback: (batches: SalesBatch[]) => void,
  defaultTermsDays = DEFAULT_TERMS_DAYS,
  includeVoided = false,
): () => void {
  return dbService.subscribe(SALES_ROOT, (root) => {
    const all = parseSalesTree(root, defaultTermsDays);
    callback(includeVoided ? all : all.filter((b) => !b.isVoided));
  });
}

/**
 * One-shot fetch of specific batches by receiptId (used by the invoice screen).
 *
 * SAME DEFAULT AS `subscribeToBatches`, deliberately. This is a second read
 * path that bypasses `useRecords` entirely, so chokepoint filtering never
 * reaches it. A filter that eleven consumers get automatically and one gets by
 * remembering is precisely the bug this stage exists to prevent.
 *
 * `invoice.tsx` is the one caller that opts in, so a voided sale still produces
 * an invoice — stamped VOIDED.
 */
export async function fetchBatchesByReceiptIds(
  receiptIds: string[],
  includeVoided = false,
): Promise<SalesBatch[]> {
  const root = await dbService.getRecord<any>(SALES_ROOT);
  const wanted = new Set(receiptIds);
  const found = parseSalesTree(root).filter((b) => wanted.has(b.id));
  return includeVoided ? found : found.filter((b) => !b.isVoided);
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
  /** Who is taking the sale — needed to attribute any advance payment. */
  actor: PaymentActor;
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
    // Attribution, from the same actor the ledger entry below uses, so a sale
    // and its opening payment always name the same person. Both fields or
    // neither: a name with no uid cannot be checked against anything.
    loggedByUid: input.actor.uid,
    loggedByName: input.actor.name,
    ...(input.notes ? { notes: input.notes } : {}),
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
    items,
  };

  // An advance taken at the counter IS a payment. Without a ledger entry it
  // would sit in `totalPaid` untraceable, and the day's drawer would be short
  // by every deposit taken — deposits being the most common cash of all.
  //
  // The batch and the opening entry go in ONE atomic update: a sale that
  // recorded an advance which never reached the ledger is exactly the
  // inconsistency this stage exists to remove.
  const opening = roundNaira(input.totalPaid);
  if (opening > 0) {
    const dayKey = localDayKey(now);
    const key = dbService.newKey(`payments/${dayKey}/${input.actor.uid}`);
    const write = buildPaymentWrite({
      batch: { dbPath, id: input.receiptId, receiptId: input.receiptId },
      amount: opening,
      method: input.paymentMethod,
      actor: input.actor,
      key,
      note: 'Advance taken at sale',
      now,
    });
    // The ref is nested INSIDE the node rather than sent as its own path.
    // RTDB rejects a multi-path update where one path is an ancestor of
    // another, and `dbPath` is an ancestor of `dbPath/paymentRefs/{key}`:
    //   "values argument contains a path … that is ancestor of another path"
    // Nesting keeps the batch, its opening entry and the ref in one atomic
    // update, which is the property that matters. `totalPaid` is already on
    // the node, so no increment is needed either.
    await dbService.updateAtomic({
      [dbPath]: { ...node, paymentRefs: { [key]: write.refValue } },
      [write.paymentPath]: write.entry,
    });
  } else {
    await dbService.setRecord(dbPath, node);
  }

  return dbPath;
}

/** Move a job to a different production stage on the board. */
export async function updateProductionStage(
  batch: Pick<SalesBatch, 'dbPath'>,
  stage: ProductionStage,
): Promise<void> {
  await dbService.updateRecord(batch.dbPath, { productionStage: stage });
}

/**
 * Mark one or more batches fully paid, by RECORDING A PAYMENT for the
 * outstanding balance on each — never by overwriting `totalPaid`.
 *
 * The old version set `totalPaid = totalAmount` directly, which created money
 * with no ledger entry: the drawer would be short by the whole amount and
 * nothing would say who marked it or how it was taken. Every naira in
 * `totalPaid` must be traceable to an entry.
 *
 * `method` is required rather than defaulted — bulk-marking ten invoices paid
 * by unspecified means puts ten untraceable entries in the day's reconciliation.
 *
 * ATOMIC ACROSS EVERY BATCH, not a loop of awaits.
 *
 * A sequential version failing on the sixth of ten invoices leaves five paid
 * and five not, with no rollback and nothing saying which. One multi-path
 * update either applies in full or not at all, so a failed bulk mark-paid
 * leaves the ledger exactly as it was and can simply be retried.
 *
 * Returns the batches it actually wrote for, so the caller can report
 * accurately rather than assuming everything selected was settled — anything
 * already paid is skipped rather than given a zero-value entry.
 */
export async function markBatchesPaid(
  batches: SalesBatch[],
  method: PaymentMethod,
  actor: PaymentActor,
): Promise<SalesBatch[]> {
  const now = new Date();
  const updates: Record<string, unknown> = {};
  const settled: SalesBatch[] = [];

  for (const batch of batches) {
    const outstanding = roundNaira(batch.totalBalance ?? batch.totalAmount - batch.totalPaid);
    if (outstanding <= 0) continue; // already settled — do not write a zero entry

    const write = buildPaymentWrite({
      batch,
      amount: outstanding,
      method,
      actor,
      note: 'Marked paid in bulk from Records',
      key: dbService.newKey(`payments/${localDayKey(now)}/${actor.uid}`),
      now,
    });

    updates[write.paymentPath] = write.entry;
    updates[write.totalPaidPath] = dbService.increment(write.delta);
    updates[write.refPath] = write.refValue;
    settled.push(batch);
  }

  if (settled.length === 0) return [];

  await dbService.updateAtomic(updates);
  return settled;
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

/**
 * Void a sale. There is no delete.
 *
 * `deleteBatch` used to call `remove()`, permanently erasing a financial record
 * — and after the payment ledger landed, orphaning every payment that pointed
 * at it. The money would still show as collected against a sale that no longer
 * existed. Cancelled jobs are normal in printing; erasing them is not.
 *
 * Voiding marks the record and excludes it from every total. It does NOT touch
 * the payment ledger: cash already taken was really taken, and stays in Daily
 * Cash. Refunding is a separate, deliberate reversal.
 *
 * Admin only (enforced by the database rules) and the reason is mandatory.
 */
export async function voidBatch(
  batch: Pick<SalesBatch, 'dbPath'>,
  reason: string,
  actor: PaymentActor,
): Promise<void> {
  const trimmed = reason.trim();
  if (!trimmed) throw new Error('A reason is required to void a sale.');

  const now = new Date();
  await dbService.updateRecord(batch.dbPath, {
    voidedAt: now.toISOString(),
    voidedAtMs: now.getTime(),
    voidedBy: actor.uid,
    voidedByName: actor.name,
    voidReason: trimmed,
  });
}
