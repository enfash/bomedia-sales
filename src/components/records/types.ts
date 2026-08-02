/**
 * Canonical domain model for the sales feature.
 *
 * There is ONE storage layout for a sale: a "batch" node written at
 *   sales/{YYYY}/{MM}/{DD}/{receiptId}
 * containing batch-level totals plus a map of line items under `items`.
 *
 * `Stored*` types describe the raw Firebase node shape. `SalesBatch` /
 * `SalesRecord` are the normalized, UI-facing types produced by the sales
 * repository. UI code should only ever touch the normalized types.
 */

export type PaymentMethod = 'Cash' | 'POS' | 'Transfer';
export type JobUnit = 'in' | 'ft';
export type TurnaroundTime = 'Standard' | 'Rush' | 'Same Day';

/** Derived payment state. Always computed from amounts — never trusted from storage. */
export type PaymentStatus = 'Paid' | 'Partial' | 'Unpaid' | 'Overdue' | 'Overpaid';

/** Where a job sits in the large-format (10ft machine) production pipeline. */
export type ProductionStage = 'Queued' | 'Printing' | 'Finishing' | 'Ready' | 'Delivered';

export const PRODUCTION_STAGES: ProductionStage[] = [
  'Queued',
  'Printing',
  'Finishing',
  'Ready',
  'Delivered',
];

/** Lifecycle of a quotation before it becomes a sale. */
export type QuoteStatus = 'Draft' | 'Sent' | 'Converted';

/** A single line item within a sale, as consumed by the UI (tables, rows, invoice). */
export interface SalesRecord {
  id: string;
  /** Firebase path to this item node, e.g. sales/2026/07/22/INV-.../items/item_0 */
  dbPath?: string;
  batchId?: string;

  jobName?: string;
  material: string;
  width: string;
  height: string;
  jobUnit: JobUnit;
  quantity: number;
  unitPrice: number;
  total: number;

  eyelets?: boolean;
  lamination?: boolean;
  turnaroundTime?: TurnaroundTime;
  type?: string;

  // Batch-level fields denormalized onto each record for flat lists.
  clientName?: string;
  contact?: string;
  createdAt?: string;
  loggedBy?: string;
  notes?: string;
  dueDate?: string;
}

/** Convenience alias — a line item is a sales record. */
export type SalesItem = SalesRecord;

/**
 * A priced adjustment recorded on the batch at write time.
 *
 * These are an **immutable snapshot**: the amounts are computed once, when the
 * sale is created, and stored on the node. They are never recomputed from live
 * Settings on read — otherwise raising the MOV next quarter would silently
 * restate every historic invoice, and a reprinted receipt would not match the
 * one the customer already paid against.
 */
export interface BatchAdjustment {
  /** `legacy` is the residual derived for batches written before this field existed. */
  kind: 'mov' | 'delivery' | 'legacy';
  label: string;
  /** Whole naira. May be negative (a legacy residual can go either way). */
  amount: number;
}

/* ------------------------------------------------------------------ *
 * PAYMENTS — an append-only ledger.
 *
 * Stored at `payments/{YYYY-MM-DD}/{uid}/{pushKey}`, NOT under the batch node.
 * Two reasons, both load-bearing:
 *
 *   1. In RTDB a write permitted at an ancestor grants the whole subtree, and
 *      admins may write the batch node. Nested payments could therefore be
 *      erased by a batch write, and no create-only rule on the children could
 *      prevent it.
 *   2. The day bucket is keyed by PAYMENT date, not sale date — a payment taken
 *      today against last month's invoice belongs in today's drawer. The uid
 *      level makes "read only your own entries" expressible as a rule rather
 *      than a UI convention, and makes the by-staff split structural.
 *
 * Entries are never edited or deleted. A mistake is corrected by a REVERSAL:
 * a new entry with a negative amount, `reversalOf` naming the original and a
 * mandatory `reversalReason`.
 * ------------------------------------------------------------------ */

export type PaymentMethodTaken = PaymentMethod;

/** The raw payment node as persisted at payments/{day}/{uid}/{pushKey}. */
export interface StoredPayment {
  /** Whole naira. Negative only on a reversal. */
  amount?: number;
  method?: PaymentMethodTaken;
  /** ISO timestamp of when the payment was taken. */
  at?: string;
  /** Epoch ms, for ordering and rules. */
  atMs?: number;
  /** Firebase auth uid of whoever took it. Must equal the {uid} path segment. */
  byUid?: string;
  /** Denormalised for display, so history does not need a users join. */
  byName?: string;
  /** Which sale this pays. */
  receiptId?: string;
  /** Full path to the batch node, so the join needs no search. */
  batchPath?: string;
  note?: string;
  /** Present only on reversals — the pushKey of the entry being reversed. */
  reversalOf?: string;
  /** Mandatory when `reversalOf` is set. */
  reversalReason?: string;
}

/** A normalized payment, ready for the UI. */
export interface PaymentEntry {
  id: string;
  /** `payments/{day}/{uid}/{id}` — where it actually lives. */
  dbPath: string;
  /** The YYYY-MM-DD bucket it was filed under. */
  dayKey: string;
  amount: number;
  method: PaymentMethodTaken;
  at: string;
  atMs: number;
  byUid: string;
  byName: string;
  receiptId: string;
  batchPath: string;
  note?: string;
  reversalOf?: string;
  reversalReason?: string;
  /** True when this entry reverses another. Cheaper than checking the sign. */
  isReversal: boolean;
}

/** A normalized sale (batch of one or more items), ready for the UI. */
export interface SalesBatch {
  /** The receiptId — also the Firebase key for the batch node. */
  id: string;
  receiptId?: string;
  /** Firebase path to the batch node, e.g. sales/2026/07/22/INV-... */
  dbPath: string;

  clientName: string;
  contact?: string;
  createdAt: string;

  records: SalesRecord[];

  /** Sum of the rounded line totals. Every naira above it is a named adjustment. */
  subtotal: number;
  /** Write-time snapshot; `subtotal + sum(adjustments) === totalAmount`. */
  adjustments: BatchAdjustment[];
  totalAmount: number;
  deliveryCost?: number;
  totalPaid: number;
  totalBalance: number;
  paymentMethod?: PaymentMethod;

  status: PaymentStatus;
  statusColor: string;

  /** Large-format production pipeline stage (defaults to 'Queued'). */
  productionStage: ProductionStage;

  /** True when this record has been voided. Excluded from every total. */
  isVoided: boolean;
  voidedAt?: string;
  voidedByName?: string;
  voidReason?: string;

  notes?: string;
  dueDate?: string;
}

/** A normalized quotation, ready for the UI. Mirrors SalesBatch minus payment. */
export interface QuoteRecord {
  id: string;
  quoteId?: string;
  dbPath: string;

  clientName: string;
  contact?: string;
  createdAt: string;

  records: SalesRecord[];
  /** Sum of the rounded line totals. */
  subtotal: number;
  /** Write-time snapshot; `subtotal + sum(adjustments) === totalAmount`. */
  adjustments: BatchAdjustment[];
  totalAmount: number;
  deliveryCost?: number;

  status: QuoteStatus;
  /** True when this record has been voided. Excluded from every total. */
  isVoided: boolean;
  voidedAt?: string;
  voidedByName?: string;
  voidReason?: string;
  notes?: string;
}

/* ------------------------------------------------------------------ *
 * Raw storage shapes (Firebase). Only the repository/migration touch these.
 * ------------------------------------------------------------------ */

/** The raw batch node as persisted at sales/YYYY/MM/DD/{receiptId}. */
export interface StoredBatch {
  receiptId?: string;
  clientName?: string;
  contact?: string;
  createdAt?: string;
  /** Epoch ms of creation — lets security rules enforce the staff 24h edit window. */
  createdAtMs?: number;
  /** Absent on batches written before the money fields landed — derived on read. */
  subtotal?: number;
  adjustments?: BatchAdjustment[];
  totalAmount?: number;
  deliveryCost?: number;
  totalPaid?: number;
  paymentMethod?: PaymentMethod;
  status?: string;
  productionStage?: ProductionStage;
  notes?: string;
  dueDate?: string;
  /* -- Void (soft delete). A sale is never removed; it is marked. -------- *
   * Cancelled jobs are normal in printing. Erasing the record is not — it
   * takes the payment history with it and leaves the ledger pointing at a
   * sale that no longer exists. Voiding keeps the audit trail and excludes
   * the sale from every total. See docs/AUDIT_2026-07.md §1.4. */
  voidedAt?: string;
  voidedAtMs?: number;
  voidedBy?: string;
  voidedByName?: string;
  voidReason?: string;
  /**
   * Pointer index into the payment ledger: `{pushKey}` -> `"{dayKey}/{uid}"`.
   *
   * Written in the same atomic update as the entry it points at. See
   * `PaymentWrite.refPath` — it is an index, not a record, and is rebuildable
   * from the ledger by `planPaymentRefBackfill`.
   */
  paymentRefs?: Record<string, string>;
  items?: Record<string, StoredItem>;
}

/** The raw quote node as persisted at quotes/YYYY/MM/DD/{quoteId}. */
export interface StoredQuote {
  quoteId?: string;
  clientName?: string;
  contact?: string;
  createdAt?: string;
  /** Absent on quotes written before the money fields landed — derived on read. */
  subtotal?: number;
  adjustments?: BatchAdjustment[];
  totalAmount?: number;
  deliveryCost?: number;
  status?: QuoteStatus;
  notes?: string;
  /* -- Void (soft delete). A sale is never removed; it is marked. -------- *
   * Cancelled jobs are normal in printing. Erasing the record is not — it
   * takes the payment history with it and leaves the ledger pointing at a
   * sale that no longer exists. Voiding keeps the audit trail and excludes
   * the sale from every total. See docs/AUDIT_2026-07.md §1.4. */
  voidedAt?: string;
  voidedAtMs?: number;
  voidedBy?: string;
  voidedByName?: string;
  voidReason?: string;
  items?: Record<string, StoredItem>;
}

/** The raw line-item node as persisted under a batch's `items` map. */
export interface StoredItem {
  id?: string;
  jobName?: string;
  material?: string;
  width?: string;
  height?: string;
  jobUnit?: JobUnit;
  quantity?: number;
  unitPrice?: number;
  total?: number;
  eyelets?: boolean;
  lamination?: boolean;
  turnaroundTime?: TurnaroundTime;
  type?: string;
  /** Present only on pre-migration legacy flat records. */
  amountPaid?: number;
  batchId?: string;
}
