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
