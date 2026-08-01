/**
 * Fixture builders for the pure-function test suite.
 *
 * Every builder returns a valid, fully-typed object under `strict` and takes a
 * partial override, so a test states only the fields it actually cares about.
 * That keeps the intent of each test visible instead of buried in boilerplate.
 *
 * NOTE: `ExpenseRecord` is imported as a *type only*. `@/hooks/use-expenses`
 * imports `dbService` -> `@/lib/firebase`, which calls `initializeApp()` at
 * module scope; a value import here would drag Firebase into every unit test.
 */

import type {
  SalesBatch,
  SalesRecord,
  StoredBatch,
  StoredItem,
} from '@/components/records/types';
import type { ExpenseRecord } from '@/hooks/use-expenses';

/** A raw line item as persisted under a batch's `items` map. */
export function makeStoredItem(overrides: Partial<StoredItem> = {}): StoredItem {
  return {
    jobName: 'Banner',
    material: 'Vinyl',
    width: '10',
    height: '4',
    jobUnit: 'ft',
    quantity: 1,
    unitPrice: 5000,
    total: 5000,
    ...overrides,
  };
}

/** A raw batch node as persisted at sales/YYYY/MM/DD/{receiptId}. */
export function makeStoredBatch(overrides: Partial<StoredBatch> = {}): StoredBatch {
  return {
    receiptId: 'INV-260715-AAAA',
    clientName: 'Acme Signs',
    contact: '08000000000',
    createdAt: '2026-07-15T10:00:00+01:00',
    totalAmount: 50000,
    totalPaid: 0,
    paymentMethod: 'Cash',
    productionStage: 'Queued',
    items: { item_0: makeStoredItem() },
    ...overrides,
  };
}

/** A normalized line item, as the UI consumes it. */
export function makeRecord(overrides: Partial<SalesRecord> = {}): SalesRecord {
  return {
    id: 'item_0',
    material: 'Vinyl',
    width: '10',
    height: '4',
    jobUnit: 'ft',
    quantity: 1,
    unitPrice: 5000,
    total: 5000,
    ...overrides,
  };
}

/**
 * A normalized batch, as the analytics selectors consume it. Note these
 * selectors read `totalAmount` / `totalPaid` / `totalBalance` directly, so the
 * builder does NOT derive balance — a test that cares must state it.
 */
export function makeBatch(overrides: Partial<SalesBatch> = {}): SalesBatch {
  return {
    id: 'INV-260715-AAAA',
    receiptId: 'INV-260715-AAAA',
    dbPath: 'sales/2026/07/15/INV-260715-AAAA',
    clientName: 'Acme Signs',
    createdAt: '2026-07-15T10:00:00+01:00',
    records: [makeRecord()],
    // Default fixture carries no adjustments, so subtotal === totalAmount.
    subtotal: 50000,
    adjustments: [],
    totalAmount: 50000,
    totalPaid: 0,
    totalBalance: 50000,
    status: 'Unpaid',
    statusColor: '#ba1a1a',
    productionStage: 'Queued',
    ...overrides,
  };
}

export function makeExpense(overrides: Partial<ExpenseRecord> = {}): ExpenseRecord {
  return {
    id: 'exp_1',
    amount: 10000,
    category: 'Materials',
    description: 'Vinyl roll',
    loggedBy: 'operator',
    createdAt: '2026-07-15T10:00:00+01:00',
    ...overrides,
  };
}

/** ISO string for `days` days before `from` (default: the pinned system time). */
export function daysAgo(days: number, from: Date = new Date()): string {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** ISO string for `days` days after `from` (default: the pinned system time). */
export function daysFromNow(days: number, from: Date = new Date()): string {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}
