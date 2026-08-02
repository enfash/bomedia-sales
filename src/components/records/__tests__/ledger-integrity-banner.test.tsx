/**
 * The banner has THREE states, and the one that matters is `unknown`.
 *
 * Before the subscriptions deliver, there is no evidence either way — and an
 * empty array is indistinguishable from "loaded, and there is nothing". A clean
 * verdict printed against data that has not arrived is a false all-clear, which
 * is worse than no answer at all.
 */

import {
  deriveIntegrityStatus,
  LedgerIntegrityBanner,
  LedgerIntegrityNote,
  useLedgerIntegrity,
} from '@/components/records/ledger-integrity-banner';
import type { PaymentEntry, SalesBatch } from '@/components/records/types';
import { makeBatch } from '@/test-support/factories';
import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

const SALE = 'sales/2026/08/01/INV-A';
let mockDeliver: ((p: PaymentEntry[]) => void) | null = null;

jest.mock('@/context/auth-context', () => ({ useAuth: () => ({ isAdmin: true }) }));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/services/payment-repository', () => ({
  subscribeToPaymentsInRange: (_s: string, _e: string, cb: (p: any[]) => void) => {
    mockDeliver = cb;
    return () => {
      mockDeliver = null;
    };
  },
}));

const theme = { outlineVariant: '#ccc', onSurfaceVariant: '#666' };

const paidSale = (over: Partial<SalesBatch> = {}) =>
  makeBatch({
    id: 'INV-A',
    dbPath: SALE,
    clientName: 'Acme',
    createdAt: new Date().toISOString(),
    totalAmount: 10_000,
    totalPaid: 4_000,
    totalBalance: 6_000,
    ...over,
  });

const entry = (amount: number): PaymentEntry => ({
  id: '-K1',
  dbPath: 'payments/x/uid-a/-K1',
  dayKey: '2026-08-01',
  amount,
  method: 'Cash',
  at: new Date().toISOString(),
  atMs: 1,
  byUid: 'uid-a',
  byName: 'Ada',
  receiptId: 'INV-A',
  batchPath: SALE,
  isReversal: false,
});

/** Renders both surfaces the way the dashboard does — one hook, two slots. */
function Harness({ batches, batchesReceived }: { batches: SalesBatch[]; batchesReceived: boolean }) {
  const integrity = useLedgerIntegrity({ batches, batchesReceived });
  return (
    <>
      <Text testID="status">{integrity.status}</Text>
      <LedgerIntegrityBanner integrity={integrity} theme={theme} reduceMotion />
      <LedgerIntegrityNote integrity={integrity} theme={theme} />
    </>
  );
}

beforeEach(() => {
  mockDeliver = null;
});

describe('deriveIntegrityStatus', () => {
  const base = { isAdmin: true, batchesReceived: true, paymentsReceived: true, mismatchedCount: 0 };

  it('is unknown until BOTH subscriptions have delivered', () => {
    expect(deriveIntegrityStatus({ ...base, batchesReceived: false })).toBe('unknown');
    expect(deriveIntegrityStatus({ ...base, paymentsReceived: false })).toBe('unknown');
  });

  it('is clean only once both have delivered and nothing disagrees', () => {
    expect(deriveIntegrityStatus(base)).toBe('clean');
  });

  it('is discrepancy when something disagrees', () => {
    expect(deriveIntegrityStatus({ ...base, mismatchedCount: 2 })).toBe('discrepancy');
  });

  it('is unknown for a non-admin, whose ledger view is partial by design', () => {
    expect(deriveIntegrityStatus({ ...base, isAdmin: false })).toBe('unknown');
    expect(deriveIntegrityStatus({ ...base, isAdmin: false, mismatchedCount: 5 })).toBe('unknown');
  });
});

describe('LedgerIntegrityBanner rendering', () => {
  it('renders NOTHING before the snapshots arrive', async () => {
    await render(<Harness batches={[]} batchesReceived={false} />);
    expect(screen.getByTestId('status').props.children).toBe('unknown');
    expect(screen.queryByText(/No discrepancies/i)).toBeNull();
    expect(screen.queryByText(/match its payments/i)).toBeNull();
  });

  // Sales delivered but payments not: still no verdict.
  it('renders nothing when only the sales snapshot has arrived', async () => {
    await render(<Harness batches={[paidSale()]} batchesReceived />);
    expect(screen.getByTestId('status').props.children).toBe('unknown');
    expect(screen.queryByText(/No discrepancies/i)).toBeNull();
  });

  it('renders the clean line once both arrive and the data agrees', async () => {
    await render(<Harness batches={[paidSale()]} batchesReceived />);
    await act(async () => mockDeliver?.([entry(4_000)]));
    expect(screen.getByTestId('status').props.children).toBe('clean');
    expect(screen.getByText(/No discrepancies in the last 90 days/i)).toBeTruthy();
    // The scope caveat must survive — silence about the window is the failure.
    expect(screen.getByText(/Older records are not checked here/i)).toBeTruthy();
  });

  it('an empty ledger with no sales is a CLEAN verdict, not unknown', async () => {
    await render(<Harness batches={[]} batchesReceived />);
    await act(async () => mockDeliver?.([]));
    expect(screen.getByTestId('status').props.children).toBe('clean');
  });

  it('renders the top banner when there is a real gap', async () => {
    await render(<Harness batches={[paidSale()]} batchesReceived />);
    await act(async () => mockDeliver?.([entry(1_000)])); // ledger says 1,000; sale claims 4,000
    expect(screen.getByTestId('status').props.children).toBe('discrepancy');
    expect(screen.getByText(/match its payments/i)).toBeTruthy();
    expect(screen.getByText(/₦3,000/)).toBeTruthy();
    expect(screen.queryByText(/No discrepancies/i)).toBeNull();
  });

  it('never shows both surfaces at once', async () => {
    await render(<Harness batches={[paidSale()]} batchesReceived />);
    await act(async () => mockDeliver?.([entry(4_000)]));
    expect(screen.queryByText(/largest gap/i)).toBeNull();
    expect(screen.getByText(/No discrepancies/i)).toBeTruthy();
  });
});
