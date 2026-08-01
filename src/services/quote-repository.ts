/**
 * Quote repository — the single, typed entry point for quotations.
 *
 * Storage layout mirrors sales:
 *   quotes/{YYYY}/{MM}/{DD}/{quoteId} -> StoredQuote
 *
 * A quote is a draft estimate. It carries the same line items as a sale but no
 * payment. `convertQuoteToSale` migrates it into the real sales ledger in one
 * step (requires a client name).
 */

import type {
  BatchAdjustment,
  JobUnit,
  QuoteRecord,
  QuoteStatus,
  SalesRecord,
  StoredItem,
  StoredQuote,
  TurnaroundTime,
} from '@/components/records/types';
import { dbService } from '@/services/db';
import { deriveLegacyMoneyFields, roundNaira } from '@/utils/money';
import { createBatch, generateReceiptId } from '@/services/sales-repository';

const QUOTES_ROOT = 'quotes';

/* ------------------------------------------------------------------ *
 * Normalization
 * ------------------------------------------------------------------ */

function normalizeItem(raw: StoredItem, id: string, quoteDbPath: string, quoteId: string): SalesRecord {
  return {
    id,
    dbPath: `${quoteDbPath}/items/${id}`,
    batchId: quoteId,
    jobName: raw.jobName,
    material: raw.material ?? '',
    width: raw.width ?? '',
    height: raw.height ?? '',
    jobUnit: (raw.jobUnit ?? 'ft') as JobUnit,
    quantity: raw.quantity ?? 0,
    unitPrice: raw.unitPrice ?? 0,
    total: raw.total ?? 0,
    eyelets: raw.eyelets,
    lamination: raw.lamination,
    turnaroundTime: raw.turnaroundTime as TurnaroundTime | undefined,
    type: raw.type,
  };
}

function normalizeQuote(node: StoredQuote, quoteDbPath: string): QuoteRecord {
  const quoteId = quoteDbPath.split('/').pop() || 'unknown';
  const records: SalesRecord[] = node.items
    ? Object.keys(node.items).map((k) => normalizeItem(node.items![k], k, quoteDbPath, quoteId))
    : [];

  // Same write-time-snapshot rule as sales: trust the stored fields, and only
  // reconstruct from the node's own numbers when they predate the fields.
  const money = node.subtotal != null && node.adjustments != null
    ? { subtotal: node.subtotal, adjustments: node.adjustments, totalAmount: node.totalAmount ?? 0 }
    : deriveLegacyMoneyFields({
        lineTotals: records.map((r) => r.total),
        totalAmount: node.totalAmount ?? 0,
        delivery: node.deliveryCost ?? 0,
      });

  return {
    id: quoteId,
    quoteId: node.quoteId ?? quoteId,
    dbPath: quoteDbPath,
    clientName: node.clientName ?? '',
    contact: node.contact,
    createdAt: node.createdAt ?? '',
    records,
    subtotal: money.subtotal,
    adjustments: money.adjustments,
    totalAmount: money.totalAmount,
    deliveryCost: node.deliveryCost,
    status: (node.status as QuoteStatus) || 'Draft',
    notes: node.notes,
  };
}

function isQuoteNode(node: any): node is StoredQuote {
  return (
    node && typeof node === 'object' &&
    typeof node.items === 'object' && node.items !== null &&
    (node.clientName !== undefined || node.quoteId || node.createdAt)
  );
}

export function parseQuotesTree(root: any): QuoteRecord[] {
  if (!root || typeof root !== 'object') return [];
  const quotes: QuoteRecord[] = [];

  const walk = (node: any, path: string[]) => {
    if (!node || typeof node !== 'object') return;
    if (isQuoteNode(node)) {
      quotes.push(normalizeQuote(node, `${QUOTES_ROOT}/${path.join('/')}`));
      return;
    }
    for (const [key, child] of Object.entries(node)) walk(child, [...path, key]);
  };

  walk(root, []);
  return quotes.sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
  );
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

export function subscribeToQuotes(callback: (quotes: QuoteRecord[]) => void): () => void {
  return dbService.subscribe(QUOTES_ROOT, (root) => callback(parseQuotesTree(root)));
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

export interface NewQuoteInput {
  clientName?: string;
  contact?: string;
  /** Sum of the rounded line totals, from `computeBatchTotals`. */
  subtotal: number;
  /** Write-time snapshot, from `computeBatchTotals`. */
  adjustments: BatchAdjustment[];
  totalAmount: number;
  deliveryCost?: number;
  items: StoredItem[];
  notes?: string;
}

export async function createQuote(input: NewQuoteInput): Promise<string> {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const quoteId = generateReceiptId('QT');
  const dbPath = `${QUOTES_ROOT}/${yyyy}/${mm}/${dd}/${quoteId}`;

  // Round at the write boundary, exactly as createBatch does — a quote and the
  // sale it converts into must agree to the naira.
  const items: Record<string, StoredItem> = {};
  input.items.forEach((item, index) => {
    items[`item_${index}`] = { ...item, total: roundNaira(item.total ?? 0) };
  });

  const node: StoredQuote = {
    quoteId,
    clientName: input.clientName ?? '',
    contact: input.contact ?? '',
    createdAt: now.toISOString(),
    subtotal: roundNaira(input.subtotal),
    adjustments: input.adjustments,
    totalAmount: roundNaira(input.totalAmount),
    deliveryCost: roundNaira(input.deliveryCost ?? 0),
    status: 'Draft',
    ...(input.notes ? { notes: input.notes } : {}),
    items,
  };

  await dbService.setRecord(dbPath, node);
  return dbPath;
}

/** Fill in / correct client details on an existing quote (e.g. before converting). */
export async function updateQuoteDetails(
  quote: Pick<QuoteRecord, 'dbPath'>,
  patch: { clientName?: string; contact?: string },
): Promise<void> {
  const updates: Record<string, string> = {};
  if (patch.clientName !== undefined) updates[`${quote.dbPath}/clientName`] = patch.clientName;
  if (patch.contact !== undefined) updates[`${quote.dbPath}/contact`] = patch.contact;
  await dbService.updateRecord('/', updates);
}

export async function deleteQuote(quote: Pick<QuoteRecord, 'dbPath'>): Promise<void> {
  await dbService.removeRecord(quote.dbPath);
}

/** Thrown when a quote can't be converted because required info is missing. */
export class MissingQuoteInfoError extends Error {
  constructor(public readonly fields: string[]) {
    super(`Missing required info: ${fields.join(', ')}`);
    this.name = 'MissingQuoteInfoError';
  }
}

/**
 * Migrate a quote into the sales ledger. Requires a client name — otherwise
 * throws {@link MissingQuoteInfoError} so the UI can prompt for it. Returns the
 * new sale's dbPath.
 */
export async function convertQuoteToSale(quote: QuoteRecord): Promise<string> {
  const missing: string[] = [];
  if (!quote.clientName?.trim()) missing.push('client name');
  if (quote.records.length === 0) missing.push('at least one item');
  if (missing.length > 0) throw new MissingQuoteInfoError(missing);

  const items: StoredItem[] = quote.records.map((r) => ({
    jobName: r.jobName,
    material: r.material,
    width: r.width,
    height: r.height,
    jobUnit: r.jobUnit,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    total: r.total,
    eyelets: r.eyelets,
    lamination: r.lamination,
    turnaroundTime: r.turnaroundTime,
    type: r.type,
  }));

  // The sale carries the quote's OWN money fields across unchanged. Converting
  // must never re-price: the customer accepted this total, and recomputing it
  // against today's MOV could quietly hand them a different number.
  const dbPath = await createBatch({
    receiptId: generateReceiptId('INV'),
    clientName: quote.clientName,
    contact: quote.contact,
    subtotal: quote.subtotal,
    adjustments: quote.adjustments,
    totalAmount: quote.totalAmount,
    deliveryCost: quote.deliveryCost ?? 0,
    totalPaid: 0,
    paymentMethod: 'Transfer',
    items,
    notes: quote.notes,
  });

  // Keep the quote for history, marked as converted.
  await dbService.updateRecord(quote.dbPath, { status: 'Converted' });
  return dbPath;
}
