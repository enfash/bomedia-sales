/**
 * Three states, three voices — enforced here rather than left to whoever edits
 * the copy next.
 *
 * `unverified` is the state the operator will actually see most: captive
 * portal, expired token, dropped connection and 5xx all map to it. If it ever
 * reads like progress — "checking", "syncing", a spinner — it rebuilds the
 * false comfort this whole stage exists to remove, so the wording is asserted,
 * not merely reviewed.
 */

import {
  PENDING_COPY,
  copyFor,
  bySeverity,
  classify,
  summarise,
  type PendingItem,
  type PendingState,
} from '@/services/pending-state';
import type { JournalEntry, ReconcileResult } from '@/services/pending-journal';

const entry = (key: string, over: Partial<JournalEntry> = {}): JournalEntry => ({
  key,
  path: `payments/2026-08-03/uid-a/${key}`,
  kind: 'payment',
  amount: 5000,
  method: 'Cash',
  receiptId: 'INV-260803-AAAA',
  byUid: 'uid-a',
  byName: 'Office',
  at: '2026-08-03T10:00:00.000Z',
  atMs: 1_754_215_200_000,
  ...over,
});

const result = (over: Partial<ReconcileResult> = {}): ReconcileResult => ({
  landed: [],
  missing: [],
  unverified: [],
  ...over,
});

describe('the copy never lets unverified read as progress', () => {
  const forbidden = /check(ing)?|sync(ing)?|retry|retrying|wait|loading|…|\.\.\./i;

  it('says we could not confirm, and asks for paper', () => {
    const copy = PENDING_COPY.unverified;
    expect(copy.headline).toMatch(/could not confirm/i);
    expect(copy.action).toMatch(/paper/i);
  });

  it('uses no progress wording anywhere in the unverified voice', () => {
    const copy = PENDING_COPY.unverified;
    expect(`${copy.label} ${copy.headline} ${copy.action}`).not.toMatch(forbidden);
  });

  it('gives each state a distinct label, so two states never read alike', () => {
    const labels = Object.values(PENDING_COPY).map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('tells the operator to act on missing, and promises only what the outbox can keep', () => {
    expect(PENDING_COPY.missing.action).toMatch(/enter it again/i);

    // Since the outbox, "pending" can honestly promise a retry — but only if
    // the app is opened again, so it says "may not send" rather than the
    // prompt pack's "will sync when you're back online".
    expect(PENDING_COPY.pending.action).toMatch(/retry when the connection returns/i);
    expect(PENDING_COPY.pending.action).toMatch(/may not send/i);
    expect(PENDING_COPY.pending.action).not.toMatch(/will sync when you.?re back online/i);

    // And it still asks for paper: a force-quit before the retry still loses it.
    expect(PENDING_COPY.pending.action).toMatch(/paper/i);
  });
});

describe('classify — carried-over writes are never "pending"', () => {
  it('marks a write issued this session as pending', () => {
    const items = classify([entry('-NEW')], new Set());
    expect(items[0].state).toBe<PendingState>('pending');
  });

  it('marks a write from a previous process as unverified, not pending', () => {
    // Nothing is still trying: the process that was trying is gone. Showing it
    // as pending would tell the operator to wait for something that will never
    // happen.
    const items = classify([entry('-OLD')], new Set(['-OLD']));
    expect(items[0].state).toBe<PendingState>('unverified');
  });

  it('marks it missing only once reconciliation says the server does not have it', () => {
    const e = entry('-OLD');
    const items = classify([e], new Set(['-OLD']), result({ missing: [e] }));
    expect(items[0].state).toBe<PendingState>('missing');
  });

  it('keeps a carried-over entry unverified while reconciliation is still running', () => {
    const items = classify([entry('-OLD')], new Set(['-OLD']), undefined);
    expect(items[0].state).toBe<PendingState>('unverified');
  });

  it('does not promote an unverified entry to missing on a failed check', () => {
    const e = entry('-OLD');
    const items = classify([e], new Set(['-OLD']), result({ unverified: [e] }));
    expect(items[0].state).toBe<PendingState>('unverified');
  });
});

describe('ordering and summary put the actionable state first', () => {
  const items: PendingItem[] = [
    { entry: entry('-P'), state: 'pending', replay: 'none' },
    { entry: entry('-U'), state: 'unverified', replay: 'none' },
    { entry: entry('-M'), state: 'missing', replay: 'none' },
  ];

  it('sorts missing above unverified above pending', () => {
    expect([...items].sort(bySeverity).map((i) => i.state)).toEqual([
      'missing',
      'unverified',
      'pending',
    ]);
  });

  it('summarises by the worst state present', () => {
    expect(summarise(items)?.state).toBe('missing');
    expect(summarise(items.slice(0, 2))?.state).toBe('unverified');
    expect(summarise(items.slice(0, 1))?.state).toBe('pending');
  });

  it('says nothing at all when there is nothing to say', () => {
    expect(summarise([])).toBeNull();
  });

  it('counts only the worst state, and gets the plural right', () => {
    const two: PendingItem[] = [
      { entry: entry('-M1'), state: 'missing', replay: 'none' },
      { entry: entry('-M2'), state: 'missing', replay: 'none' },
      { entry: entry('-P'), state: 'pending', replay: 'none' },
    ];
    expect(summarise(two)?.text).toBe('2 records did not save');
    expect(summarise([two[0], two[2]])?.text).toBe('1 record did not save');
  });

  it('never describes unverified as saved or as in progress', () => {
    const text = summarise([{ entry: entry('-U'), state: 'unverified', replay: 'none' }])!.text;
    expect(text).toMatch(/could not be confirmed/i);
    expect(text).not.toMatch(/sav(ed|ing)|sync|check/i);
  });
});

describe('copyFor — never tells the operator to re-enter what the app is resending', () => {
  it('says it is being sent again, and NOT to enter it twice', () => {
    const copy = copyFor({ entry: entry('-K1'), state: 'missing', replay: 'auto' });
    expect(copy.action).toMatch(/do not enter it a second time/i);
    expect(copy.action).not.toMatch(/enter it again/i);
  });

  it('asks for a decision on an entry too old to send silently', () => {
    const copy = copyFor({ entry: entry('-K1'), state: 'missing', replay: 'confirm' });
    expect(copy.headline).toMatch(/12 hours/i);
    expect(copy.action).toMatch(/not already entered/i);
  });

  it('falls back to re-entry when there is nothing to resend', () => {
    const copy = copyFor({ entry: entry('-K1'), state: 'missing', replay: 'none' });
    expect(copy.action).toMatch(/enter it again/i);
  });

  it('pending now promises a retry, but not that closing the app is safe', () => {
    const copy = copyFor({ entry: entry('-K1'), state: 'pending', replay: 'auto' });
    expect(copy.action).toMatch(/retry when the connection returns/i);
    expect(copy.action).toMatch(/may not send/i);
    // The sentence the prompt pack asked for, and the reason it was refused.
    expect(copy.action).not.toMatch(/will sync when you.?re back online/i);
  });

  it('unverified still asks for paper — replay cannot help what it cannot confirm', () => {
    const copy = copyFor({ entry: entry('-K1'), state: 'unverified', replay: 'auto' });
    expect(copy.action).toMatch(/paper/i);
  });
});
