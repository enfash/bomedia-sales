/**
 * Sales repository — Postgres-backed. db.ts port, slice 4: read-only proof,
 * off-screen. Not yet wired to any real screen — that's slice 5, which also
 * merges this into (replaces) the Firebase-backed `sales-repository.ts`.
 *
 * One Firebase node (StoredBatch with a nested `items` map) becomes a join
 * across sales, sale_lines, batch_adjustments, clients, and the sale_totals
 * view (billed/paid, computed the same way client_debt computes it, just
 * grouped by sale instead of by client — see the migration that added it).
 *
 * `loggedByName`/`voidedByName` are `sales.logged_by_name`/`voided_by_name`
 * snapshots, not joins to `profiles.name` — see the migration that added
 * those columns for why.
 */

import * as Crypto from 'expo-crypto';
import { supabase } from '@/lib/auth';
import { generateReceiptId } from '@/services/sales-repository';
import { pgPath } from '@/services/existence-check-pg';
import { sendOp } from '@/services/outbox-send';
import { journalled, type JournalEntry } from '@/services/pending-journal';
import type { CreateSaleAdjustment, CreateSaleLine, CreateSalePayload, OutboxOp } from '@/services/outbox';
import type { PaymentActor } from '@/services/payment-repository';
import { computePaymentStatus, STATUS_META } from '@/utils/payment-status';
import { isPastDue } from '@/utils/date';
import { roundNaira } from '@/utils/money';
import type { BatchAdjustment, JobUnit, ProductionStage, SalesBatch, SalesRecord, TurnaroundTime } from '@/components/records/types';

const DEFAULT_TERMS_DAYS = 7;

interface SaleLineRow {
  id: string;
  job_name: string | null;
  material_type: string;
  width_ft: number;
  height_ft: number;
  job_unit: string;
  quantity: number;
  unit_price: number;
  total: number;
  eyelets: boolean;
  lamination: boolean;
  turnaround_time: string | null;
}

interface SaleRow {
  id: string;
  receipt_number: string;
  client_id: string;
  created_at: string;
  job_status: string;
  due_date: string | null;
  logged_by: string;
  logged_by_name: string;
  notes: string | null;
  is_voided: boolean;
  voided_at: string | null;
  voided_by_name: string | null;
  void_reason: string | null;
  clients: { name: string; contact: string | null } | null;
  sale_lines: SaleLineRow[];
  batch_adjustments: { kind: string; label: string; amount: number }[];
}

/**
 * Reverses sale_lines' storage conversion for display: width_ft/height_ft
 * are always canonical feet (see that table's migration), and job_unit
 * records what the operator actually typed only so this can rebuild it —
 * "6in x 8in" on the receipt, not "0.5ft x 0.67ft".
 *
 * The inches path isn't a lossless round trip: 4in stored is
 * 4/12 = 0.3333ft (numeric(10,4) has 4 decimal places), and 0.3333*12 =
 * 3.9996, not 4 — floating-point noise from the storage rounding, not a bug
 * in the multiplication. Rounding to 2dp of inches before display absorbs
 * that noise for anything a print job realistically measures in (finer than
 * a hundredth of an inch was never meaningful here) without costing real
 * precision on the feet path, where no conversion happens and the stored
 * value is already exact.
 *
 * Either way the result is a genuine JS number by this point, and
 * `String()` on a number never carries storage-format trailing zeros —
 * `String(4)` is `"4"` regardless of whether Postgres sent `4` or `4.0000`
 * over the wire; JSON.parse (which @supabase/postgrest-js uses directly,
 * confirmed by reading its source) already discards that formatting before
 * this function ever sees the value.
 */
function formatDimension(feet: number, unit: string): string {
  const value = unit === 'in' ? Math.round(feet * 12 * 100) / 100 : feet;
  return String(value);
}

function normalizeLine(row: SaleLineRow, saleId: string): SalesRecord {
  return {
    id: row.id,
    batchId: saleId,
    jobName: row.job_name ?? undefined,
    material: row.material_type,
    // Firebase stored these as user-typed strings, in whatever unit was
    // typed; sale_lines always stores canonical feet — formatDimension is
    // what reconstructs the original unit for display, keeping SalesRecord's
    // shape (and every UI that reads `.width`/`.height` as text) unchanged.
    width: formatDimension(row.width_ft, row.job_unit),
    height: formatDimension(row.height_ft, row.job_unit),
    jobUnit: row.job_unit as JobUnit,
    quantity: row.quantity,
    unitPrice: row.unit_price,
    total: roundNaira(row.total),
    eyelets: row.eyelets,
    lamination: row.lamination,
    turnaroundTime: (row.turnaround_time as TurnaroundTime | null) ?? undefined,
  };
}

function normalizeSale(
  row: SaleRow,
  totals: { total_amount: number | null; total_paid: number | null } | undefined,
  defaultTermsDays = DEFAULT_TERMS_DAYS,
): SalesBatch {
  const totalAmount = roundNaira(totals?.total_amount ?? 0);
  const totalPaid = roundNaira(totals?.total_paid ?? 0);
  const status = computePaymentStatus(totalAmount, totalPaid, isPastDue(row.created_at, row.due_date ?? undefined, defaultTermsDays));

  const adjustments: BatchAdjustment[] = row.batch_adjustments.map((a) => ({
    kind: a.kind as BatchAdjustment['kind'],
    label: a.label,
    amount: a.amount,
  }));
  const subtotal = roundNaira(row.sale_lines.reduce((sum, l) => sum + l.total, 0));

  return {
    id: row.id,
    receiptId: row.receipt_number,
    dbPath: row.id, // no Firebase path concept anymore; slice 5 resolves every dbPath-keyed call site to use id directly
    clientName: row.clients?.name ?? 'Unknown Client',
    contact: row.clients?.contact ?? undefined,
    createdAt: row.created_at,
    records: row.sale_lines.map((l) => normalizeLine(l, row.id)),
    subtotal,
    adjustments,
    totalAmount,
    totalPaid,
    totalBalance: roundNaira(totalAmount - totalPaid),
    status,
    statusColor: STATUS_META[status].color,
    productionStage: row.job_status as ProductionStage,
    paymentRefCount: 0, // no paymentRefs index in Postgres — payment_allocations is queried directly instead (slice 5)
    isVoided: row.is_voided,
    voidedAt: row.voided_at ?? undefined,
    voidedByName: row.voided_by_name ?? undefined,
    voidReason: row.void_reason ?? undefined,
    loggedByUid: row.logged_by,
    loggedByName: row.logged_by_name,
    notes: row.notes ?? undefined,
    dueDate: row.due_date ?? undefined,
  };
}

const SALE_SELECT = `
  id, receipt_number, client_id, created_at, job_status, due_date, logged_by, logged_by_name,
  notes, is_voided, voided_at, voided_by_name, void_reason,
  clients ( name, contact ),
  sale_lines ( id, job_name, material_type, width_ft, height_ft, job_unit, quantity, unit_price, total, eyelets, lamination, turnaround_time ),
  batch_adjustments ( kind, label, amount )
`;

/**
 * One sale, fully composed — the read-side proof for this slice. `sale_totals`
 * has no declared FK to `sales` (it's a view, not a table PostgREST can
 * auto-embed), so it's a second query, merged in here.
 */
export async function fetchSaleById(id: string): Promise<SalesBatch | null> {
  const [{ data: sale, error: saleError }, { data: totals, error: totalsError }] = await Promise.all([
    supabase.from('sales').select(SALE_SELECT).eq('id', id).maybeSingle(),
    supabase.from('sale_totals').select('total_amount, total_paid').eq('sale_id', id).maybeSingle(),
  ]);

  if (saleError) throw saleError;
  if (totalsError) throw totalsError;
  if (!sale) return null;

  return normalizeSale(sale as unknown as SaleRow, totals ?? undefined);
}

/* ------------------------------------------------------------------ *
 * Writes — tested directly against the RPC, NOT wired to any screen.
 * See payment-repository-pg.ts for the twin of this pattern.
 *
 * KNOWN GAP, same shape as the one already flagged for standalone
 * recordPayment: `create_sale`'s `p_client_id` is a real foreign key into
 * `clients`. `NewSaleInput` below takes `clientId` as a plain required
 * field rather than resolving it from a name/contact the way the Firebase
 * `createBatch` does (`clientName`/`contact` free text, no FK) — because
 * that resolution (find-or-create against `clients`) does not exist yet.
 * Nothing in this file papers over that; a caller with only a client's name
 * cannot call `createSale` until something builds it. Flagged here rather
 * than assumed, same as the payment gap.
 * ------------------------------------------------------------------ */

export interface NewSaleLineInput {
  jobName?: string;
  material: string;
  /** As the operator typed it, in `jobUnit` — same shape StoredItem used. */
  width: string;
  height: string;
  jobUnit: JobUnit;
  quantity: number;
  unitPrice: number;
  total: number;
  eyelets?: boolean;
  lamination?: boolean;
  turnaroundTime?: TurnaroundTime;
}

export interface NewSaleInput {
  /** Resolved `clients.id` — see the gap noted above. */
  clientId: string;
  /** For the journal only — a resolved id says nothing recognisable back. */
  clientName: string;
  lines: NewSaleLineInput[];
  adjustments?: BatchAdjustment[];
  notes?: string;
  dueDate?: string;
  openingPayment?: { amount: number; method: 'Transfer' | 'POS' | 'Cash' };
  actor: PaymentActor;
}

/**
 * Inches → canonical feet, the inverse of `formatDimension`. Rounded to 4dp
 * to match `sale_lines.width_ft`/`height_ft`'s numeric(10,4) precision, so
 * what's sent is exactly what gets stored rather than something Postgres
 * rounds on the way in — see the widen-precision migration for why 4dp.
 */
function toCanonicalFeet(raw: string, unit: JobUnit): number {
  const value = Number(raw);
  const feet = unit === 'in' ? value / 12 : value;
  return Math.round(feet * 10000) / 10000;
}

/**
 * Build the op for one sale. Pure — no id generation, no I/O — so it's
 * testable without a running stack, same split as `buildRecordPaymentOp`.
 * `receiptNumber` and `openingPaymentBatchId` are generated by the caller
 * (`createSale`) BEFORE this is called, for the same reason every other
 * client-generated key here is: the journal has to know the key before the
 * write is issued.
 */
export function buildCreateSaleOp(
  input: NewSaleInput,
  receiptNumber: string,
  openingPaymentBatchId?: string,
): OutboxOp {
  if (input.openingPayment && input.openingPayment.amount > 0 && !openingPaymentBatchId) {
    throw new Error('An opening payment requires a payment_batch_id.');
  }

  const lines: CreateSaleLine[] = input.lines.map((line) => ({
    material_type: line.material,
    width_ft: toCanonicalFeet(line.width, line.jobUnit),
    height_ft: toCanonicalFeet(line.height, line.jobUnit),
    job_unit: line.jobUnit,
    quantity: line.quantity,
    unit_price: line.unitPrice,
    total: roundNaira(line.total),
    eyelets: line.eyelets,
    lamination: line.lamination,
    turnaround_time: line.turnaroundTime,
    job_name: line.jobName,
  }));

  const adjustments: CreateSaleAdjustment[] = (input.adjustments ?? []).map((a) => ({
    kind: a.kind,
    label: a.label,
    amount: roundNaira(a.amount),
  }));

  const payload: CreateSalePayload = {
    receipt_number: receiptNumber,
    client_id: input.clientId,
    lines,
    adjustments,
    notes: input.notes,
    due_date: input.dueDate,
  };

  if (input.openingPayment && input.openingPayment.amount > 0 && openingPaymentBatchId) {
    payload.opening_payment = {
      payment_batch_id: openingPaymentBatchId,
      amount: roundNaira(input.openingPayment.amount),
      method: input.openingPayment.method,
    };
  }

  return { kind: 'create_sale', payload };
}

/**
 * The journal entry for a sale: the client-generated key that proves it
 * landed, and enough for the operator to re-enter it by hand — mirrors
 * `createBatch`'s Firebase journal entry.
 *
 * `amount` is the full sale total (lines + adjustments), matching what the
 * Firebase version journalled — NOT just the opening payment — because a
 * `missing` sale is the whole sale lost, not only its advance.
 */
export function journalEntryForSale(
  op: Extract<OutboxOp, { kind: 'create_sale' }>,
  actor: PaymentActor,
  clientName: string,
  now: Date = new Date(),
): JournalEntry {
  const linesTotal = op.payload.lines.reduce((sum, l) => sum + l.total, 0);
  const adjustmentsTotal = (op.payload.adjustments ?? []).reduce((sum, a) => sum + a.amount, 0);

  return {
    key: op.payload.receipt_number,
    path: pgPath('sales', op.payload.receipt_number),
    kind: 'sale',
    amount: roundNaira(linesTotal + adjustmentsTotal),
    method: op.payload.opening_payment?.method,
    receiptId: op.payload.receipt_number,
    clientName,
    byUid: actor.uid,
    byName: actor.name,
    at: now.toISOString(),
    atMs: now.getTime(),
    op,
  };
}

export interface CreateSaleResult {
  receiptNumber: string;
  openingPaymentBatchId?: string;
}

/** Create a sale (optionally with a bundled opening payment) in Postgres. */
export async function createSale(input: NewSaleInput): Promise<CreateSaleResult> {
  const receiptNumber = generateReceiptId();
  const openingPaymentBatchId =
    input.openingPayment && input.openingPayment.amount > 0 ? Crypto.randomUUID() : undefined;

  const op = buildCreateSaleOp(input, receiptNumber, openingPaymentBatchId) as Extract<
    OutboxOp,
    { kind: 'create_sale' }
  >;
  const entry = journalEntryForSale(op, input.actor, input.clientName);

  await journalled(entry, () => sendOp(op));
  return { receiptNumber, openingPaymentBatchId };
}
