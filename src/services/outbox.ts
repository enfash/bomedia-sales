import type { JournalEntry } from '@/services/pending-journal';

/**
 * Replay for writes that provably did not reach the server.
 *
 * This is the pending journal plus a payload — not a second queue. The journal
 * already records, before every money write, the key that write would land
 * under and the node whose existence proves it did. The outbox adds the write
 * itself, so an entry the server does not have can be sent again instead of
 * only being reported.
 *
 * THE DUPLICATE-SAFETY PROPERTY, which everything here exists to preserve:
 *
 *   Replay happens ONLY on the verdict `missing`.
 *
 * `missing` is the one verdict that means the server was asked and answered
 * that it does not have the write. `unverified` means the question could not be
 * asked — captive portal, expired token, dead uplink — and replaying on it
 * would post money the server may already hold. `landed` obviously needs
 * nothing. This is a safety invariant, NOT an optimisation: widening replay to
 * `unverified` to "catch more" converts this feature into a duplicate-payment
 * generator. See `outbox.test.ts`, which asserts it directly.
 */

/**
 * How old an entry may be and still be sent automatically.
 *
 * Past this, the shop has had time to notice and re-enter it on paper or by
 * hand, and a silent post days later is a duplicate nobody can trace back to a
 * cause. Older entries are surfaced for the operator to confirm instead.
 */
export const AUTO_REPLAY_MAX_AGE_MS = 12 * 60 * 60 * 1000; // 12 hours

/**
 * `ServerValue.increment` is an opaque SDK sentinel and does not survive
 * JSON.stringify, so the stored payload carries this marker instead and the
 * real sentinel is rebuilt at write time. The same encoded object is what gets
 * persisted AND what the original write uses, so a replay cannot drift from the
 * write it repeats.
 */
export interface IncrementMarker {
  __increment: number;
}

export function encodeIncrement(delta: number): IncrementMarker {
  return { __increment: delta };
}

/** The write itself, in a form that survives storage. */
export type OutboxOp =
  | { kind: 'update'; updates: Record<string, unknown> }
  | { kind: 'set'; path: string; value: unknown };

export type ReplayOutcome = 'sent' | 'skipped-unverified' | 'skipped-landed' | 'skipped-too-old' | 'no-payload' | 'failed';

export interface ReplayResult {
  key: string;
  outcome: ReplayOutcome;
  error?: unknown;
}

export interface ReplayDeps {
  /** Sends one op. Injected so the replay logic is testable without Firebase. */
  send: (op: OutboxOp) => Promise<void>;
  /** Drops the journal entry once the server has it. */
  clear: (key: string) => Promise<void>;
  now?: number;
}

export function isAutoReplayable(entry: JournalEntry, now = Date.now()): boolean {
  return Boolean(entry.op) && now - entry.atMs <= AUTO_REPLAY_MAX_AGE_MS;
}

/**
 * Send the writes the server confirmed it does not have.
 *
 * SEQUENTIAL, IN ISSUE ORDER, STOPPING AT THE FIRST FAILURE. Money writes are
 * ordered — a payment against a sale that has not landed yet is a payment
 * against nothing — and a failure means the connection went away again, so the
 * ones behind it would fail too and burn their one clean attempt. Nothing is
 * ever replayed concurrently: two in-flight replays cannot be reasoned about
 * from the journal, which is a single-writer log.
 *
 * `missingKeys` must come from reconciliation, not from the caller's opinion.
 */
export async function replayMissing(
  entries: JournalEntry[],
  missingKeys: Set<string>,
  deps: ReplayDeps,
): Promise<ReplayResult[]> {
  const now = deps.now ?? Date.now();
  const results: ReplayResult[] = [];

  const ordered = [...entries].sort((a, b) => a.atMs - b.atMs);

  for (const entry of ordered) {
    // THE INVARIANT. Anything not confirmed absent is left alone, whatever it
    // costs in convenience.
    if (!missingKeys.has(entry.key)) {
      results.push({ key: entry.key, outcome: 'skipped-unverified' });
      continue;
    }
    if (!entry.op) {
      // Written before the outbox existed, or a write the outbox does not cover.
      results.push({ key: entry.key, outcome: 'no-payload' });
      continue;
    }
    if (now - entry.atMs > AUTO_REPLAY_MAX_AGE_MS) {
      results.push({ key: entry.key, outcome: 'skipped-too-old' });
      continue;
    }

    try {
      await deps.send(entry.op);
      await deps.clear(entry.key);
      results.push({ key: entry.key, outcome: 'sent' });
    } catch (error) {
      results.push({ key: entry.key, outcome: 'failed', error });
      // Stop: the connection has gone again, and the entries behind this one
      // would each fail in turn.
      break;
    }
  }

  return results;
}
