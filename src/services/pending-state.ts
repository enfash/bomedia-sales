import { isAutoReplayable } from '@/services/outbox';
import type { JournalEntry, ReconcileResult } from '@/services/pending-journal';

/**
 * What the operator is told about a write, and what it asks of them.
 *
 * THREE STATES, THREE VOICES. They are never collapsed, because they feel
 * similar and mean opposite things about whether the operator must act:
 *
 *   pending     still trying           keep the app open — no action yet
 *   unverified  we could not confirm   WRITE IT ON PAPER — we do not know
 *   missing     it did not save        re-enter it
 *
 * `unverified` is the one to get right. Given the existence check's mapping —
 * captive portal, expired token, dropped connection, 5xx all land there — it is
 * the most common non-clean verdict by a distance, so it is the state the
 * operator actually sees. It must therefore read as UNCERTAINTY, not as
 * progress: "checking…", a spinner, or any wording that implies the app is
 * working on it rebuilds exactly the false comfort this stage exists to remove.
 * The app is not working on it. It asked, and it did not get an answer.
 */
export type PendingState = 'pending' | 'unverified' | 'missing';

export interface PendingItem {
  entry: JournalEntry;
  state: PendingState;
  /**
   * What may happen to a `missing` entry:
   *   auto     the outbox will resend it — the operator must NOT re-enter it
   *   confirm  too old to send silently; the operator decides
   *   none     nothing to resend (no stored payload), so re-enter by hand
   */
  replay: 'auto' | 'confirm' | 'none';
}

export interface PendingCopy {
  /** Four words at most — chip and row label. */
  label: string;
  /** What is true. */
  headline: string;
  /** What the operator should do about it. Never empty for a non-pending state. */
  action: string;
}

export const PENDING_COPY: Record<PendingState, PendingCopy> = {
  pending: {
    label: 'Saving',
    headline: 'Saved on this phone only.',
    // The outbox means this can now honestly promise a retry — but only if the
    // app is opened again, and only if the server turns out not to have it. So
    // it says "may not send", not "will sync when you're back online". The
    // difference is the whole reason the copy was rewritten in the first place.
    action:
      'It will retry when the connection returns. If you close the app it may not send — write it on paper now.',
  },
  unverified: {
    label: 'Not confirmed',
    // No "checking", no "syncing", no ellipsis. The app is not working on it.
    headline: 'We could not confirm this reached the server.',
    action: 'Write it on paper now. It may or may not have saved.',
  },
  missing: {
    label: 'Did not save',
    headline: 'This did not save.',
    action: 'Enter it again.',
  },
};

/**
 * What a `missing` entry says depends on whether the app may resend it.
 *
 * Telling the operator to "enter it again" for a write the outbox is about to
 * resend is how a duplicate payment gets created by the warning itself.
 */
export function copyFor(item: PendingItem): PendingCopy {
  if (item.state !== 'missing') return PENDING_COPY[item.state];

  if (item.replay === 'auto') {
    return {
      label: 'Sending again',
      headline: 'This did not reach the server.',
      action: 'Sending it again now — do not enter it a second time.',
    };
  }
  if (item.replay === 'confirm') {
    return {
      label: 'Needs a decision',
      headline: 'This did not save, and it is more than 12 hours old.',
      // Half a day is long enough for the shop to have re-entered it by hand.
      // Posting it silently now would be a duplicate nobody could trace.
      action: 'Check it was not already entered, then send it or dismiss it.',
    };
  }
  return PENDING_COPY.missing;
}

/**
 * Sort the journal into what the operator is shown.
 *
 * `carriedOver` is the set of keys that were already in the journal when the
 * app started — writes from a previous life of the process. Anything else is
 * something this session issued and is still waiting on.
 *
 * A carried-over entry is NEVER `pending`: the process that was trying is gone,
 * so nothing is still trying. It is whatever reconciliation said, and until
 * reconciliation has answered it is `unverified` — the honest state, and
 * deliberately the pessimistic one.
 */
export function classify(
  entries: JournalEntry[],
  carriedOver: Set<string>,
  reconciled?: ReconcileResult,
  now = Date.now(),
): PendingItem[] {
  const missing = new Set((reconciled?.missing ?? []).map((e) => e.key));

  return entries.map((entry) => {
    const replay: PendingItem['replay'] = !entry.op
      ? 'none'
      : isAutoReplayable(entry, now)
        ? 'auto'
        : 'confirm';

    if (missing.has(entry.key)) return { entry, state: 'missing' as const, replay };
    if (carriedOver.has(entry.key)) return { entry, state: 'unverified' as const, replay };
    return { entry, state: 'pending' as const, replay };
  });
}

/** Worst-first, so the row that needs action is the one at the top. */
const SEVERITY: Record<PendingState, number> = { missing: 0, unverified: 1, pending: 2 };

export function bySeverity(a: PendingItem, b: PendingItem): number {
  const bySeverityRank = SEVERITY[a.state] - SEVERITY[b.state];
  return bySeverityRank !== 0 ? bySeverityRank : b.entry.atMs - a.entry.atMs;
}

/** The single line the banner leads with. Names the worst state present. */
export function summarise(items: PendingItem[]): { state: PendingState; text: string } | null {
  if (items.length === 0) return null;
  const worst = [...items].sort(bySeverity)[0].state;
  const count = items.filter((i) => i.state === worst).length;
  const noun = count === 1 ? 'record' : 'records';

  if (worst === 'missing') return { state: worst, text: `${count} ${noun} did not save` };
  if (worst === 'unverified') return { state: worst, text: `${count} ${noun} could not be confirmed` };
  return { state: worst, text: `${count} ${noun} saved on this phone only` };
}
