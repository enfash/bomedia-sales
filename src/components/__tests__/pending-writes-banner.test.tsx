/**
 * FIRST PAINT is what this pins.
 *
 * The ledger-integrity banner got exactly this wrong once: an empty array is
 * indistinguishable from "we have not looked yet", and printing a verdict
 * against data that has not arrived is a verdict the screen has not earned.
 * This banner sits ABOVE the navigator, so anything it renders on a clean cold
 * start also moves every screen underneath it down.
 *
 * So: nothing on a clean start, nothing while reconciliation is still running,
 * and no placeholder occupying space in either case.
 */

import { PendingWritesBanner } from '@/components/pending-writes-banner';
import type { JournalEntry } from '@/services/pending-journal';
import type { PendingItem, PendingState } from '@/services/pending-state';
import { render, screen } from '@testing-library/react-native';
import React from 'react';

let mockValue: { items: PendingItem[]; reconciling: boolean } = { items: [], reconciling: false };

jest.mock('@/context/pending-writes-context', () => ({
  usePendingWrites: () => ({ ...mockValue, dismiss: jest.fn(), refresh: jest.fn() }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/hooks/use-theme', () => ({
  useTheme: () => ({
    error: '#ba1a1a',
    primary: '#2e388d',
    onSurfaceVariant: '#454651',
    surfaceVariant: '#eff4ff',
    outlineVariant: '#c6c5d3',
  }),
}));

const entry = (key: string): JournalEntry => ({
  key,
  path: `payments/2026-08-03/uid-a/${key}`,
  kind: 'payment',
  amount: 900,
  method: 'POS',
  receiptId: 'INV-260803-AAAA',
  clientName: 'Idris',
  byUid: 'uid-a',
  byName: 'Office',
  at: '2026-08-03T10:00:00.000Z',
  atMs: 1_754_215_200_000,
});

const item = (state: PendingState, key = '-K1'): PendingItem => ({ entry: entry(key), state });

afterEach(() => {
  mockValue = { items: [], reconciling: false };
});

describe('first paint', () => {
  it('renders NOTHING on a clean cold start', async () => {
    await render(<PendingWritesBanner />);
    // Not "renders an empty container" — nothing at all, or every screen below
    // it starts life pushed down by a warning about no problem.
    expect(screen.toJSON()).toBeNull();
  });

  it('renders nothing while reconciliation is still answering', async () => {
    // The check can take as long as a hostile network takes. A placeholder here
    // would both shift the layout and imply the app is working on something the
    // operator should wait for.
    mockValue = { items: [], reconciling: true };
    await render(<PendingWritesBanner />);
    expect(screen.toJSON()).toBeNull();
  });

  it('occupies no space until there is something to say', async () => {
    const { rerender } = await render(<PendingWritesBanner />);
    expect(screen.toJSON()).toBeNull();

    mockValue = { items: [item('missing')], reconciling: false };
    await rerender(<PendingWritesBanner />);
    expect(screen.toJSON()).not.toBeNull();
  });
});

describe('what it says', () => {
  it('leads with the action for a missing write', async () => {
    mockValue = { items: [item('missing')], reconciling: false };
    await render(<PendingWritesBanner />);
    expect(screen.getByText(/did not save/i)).toBeTruthy();
    expect(screen.getByText(/enter it again/i)).toBeTruthy();
  });

  it('says unverified could not be CONFIRMED, and never that it is in progress', async () => {
    mockValue = { items: [item('unverified')], reconciling: false };
    await render(<PendingWritesBanner />);

    expect(screen.getByText(/could not be confirmed/i)).toBeTruthy();
    expect(screen.queryByText(/check(ing)?|sync(ing)?|retry|loading/i)).toBeNull();
  });

  it('asks for paper on a pending write, because a force-quit still loses it', async () => {
    mockValue = { items: [item('pending')], reconciling: false };
    await render(<PendingWritesBanner />);
    expect(screen.getByText(/paper/i)).toBeTruthy();
  });

  it('leads with the worst state when several are present', async () => {
    mockValue = {
      items: [item('missing', '-M'), item('unverified', '-U'), item('pending', '-P')],
      reconciling: false,
    };
    await render(<PendingWritesBanner />);
    expect(screen.getByText(/did not save/i)).toBeTruthy();
  });
});
