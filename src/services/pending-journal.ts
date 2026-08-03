import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The pending-write journal — a RECONCILIATION LOG, not a queue.
 *
 * WHY IT EXISTS. The JS Firebase SDK has no on-disk write queue: an offline
 * write lives in memory and dies with the process. The listeners still fire
 * from the local cache, so the balance drops, the payment appears in the
 * history, and the invoice reads Paid — it looks completely successful, because
 * from the app's point of view it succeeded. Force-quit before reconnect and
 * the payment is gone, with no error and no trace. See
 * `docs/AUDIT_2026-07.md` → "Offline writes are lost silently".
 *
 * WHAT THIS DOES ABOUT IT. Push keys are generated on the client, so the key of
 * a write can be recorded BEFORE the write is issued:
 *
 *   1. `register()` the key, the node path that would prove it landed, and
 *      enough human context to re-enter it by hand.
 *   2. `clear()` on the server ack.
 *   3. At the next cold start, `reconcile()` checks each surviving entry
 *      against the SERVER. Present → clear silently; the write landed and only
 *      the ack was lost. Absent → surface it for MANUAL re-entry.
 *
 * WHAT IT DELIBERATELY DOES NOT DO: replay. A replay cannot know whether the
 * original landed under a different key, and only the operator can confirm what
 * was actually collected. Manual re-entry also produces a genuinely new key, so
 * there is no duplicate-key hazard. This journal recovers INFORMATION, not
 * writes — it is not durability, and Stage 5 does not ship durability.
 */

/**
 * ONE STORAGE KEY PER ENTRY, not one blob holding all of them.
 *
 * The journal is PER DEVICE. AsyncStorage is local to this installation — on
 * native a sandboxed store, on web `localStorage` for this origin — so the
 * phone and a browser signed into the same account keep separate journals. A
 * write recorded on the phone is invisible to the web app and vice versa; each
 * device reconciles only what it issued, which is correct, because only the
 * device that issued a write knows it was pending.
 *
 * But "per device" is not "one process". Two browser tabs of the web app share
 * one `localStorage`, and an in-process lock cannot reach across them. Under a
 * single JSON blob, that is a read-modify-write two tabs can interleave —
 * dropping exactly the record whose job is not to be dropped.
 *
 * Storing each entry under its own key removes the race rather than narrowing
 * it: `register` and `clear` become single-key writes, which are atomic in both
 * backends, so there is no read-modify-write for anything to interleave with.
 * `list()` scans the prefix.
 */
const KEY_PREFIX = 'bomedia:pending-journal:v1:';

export type JournalKind = 'sale' | 'payment' | 'reversal';

export interface JournalEntry {
  /** The client-generated key: a payment push key, or a receiptId for a sale. */
  key: string;
  /**
   * The node whose EXISTENCE proves the write landed.
   *
   * For a sale this is the batch node — a sale with an advance writes the batch,
   * its opening ledger entry and the ref in ONE atomic update, so the batch
   * node existing means all three landed.
   */
  path: string;
  kind: JournalKind;
  /** Naira. What the operator would have to re-enter. */
  amount: number;
  method?: string;
  receiptId?: string;
  clientName?: string;
  byUid: string;
  byName: string;
  at: string;
  atMs: number;
}

/**
 * The answer to "did this write reach the server?".
 *
 * `unverified` is NOT "absent" — it means the check could not run, and it is
 * the third state the audit insists on. Reporting a write as lost on the
 * strength of a failed read would send the operator to re-enter money that is
 * already in the ledger.
 */
export type Verdict = 'landed' | 'missing' | 'unverified';

/** Checks the SERVER, never a cache. Returns null when it could not tell. */
export type ExistenceCheck = (path: string) => Promise<boolean | null>;

export interface ReconcileResult {
  /** Landed after all — cleared from the journal, nothing to tell the operator. */
  landed: JournalEntry[];
  /** Never reached the server. Surface these for manual re-entry. */
  missing: JournalEntry[];
  /** Could not be checked. Kept, and checked again next time. */
  unverified: JournalEntry[];
}

const storageKeyFor = (key: string) => `${KEY_PREFIX}${key}`;

/**
 * Record a write BEFORE issuing it.
 *
 * NEVER THROWS. A failed journal write degrades the safety net; it must not
 * refuse the payment. A sale that cannot be recorded because its insurance
 * could not be written is a worse outcome than an unrecorded insurance policy.
 *
 * One key, one write. Nothing is read first, so there is no read-modify-write
 * for another tab or another process to interleave with.
 */
export async function register(entry: JournalEntry): Promise<void> {
  try {
    await AsyncStorage.setItem(storageKeyFor(entry.key), JSON.stringify(entry));
  } catch (err) {
    console.warn('pending-journal: could not record a pending write (continuing):', err);
  }
}

/** Drop an entry once the server has acked it. Never throws. */
export async function clear(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKeyFor(key));
  } catch (err) {
    console.warn('pending-journal: could not clear a pending write:', err);
  }
}

/** Everything still unaccounted for, newest first. */
export async function list(): Promise<JournalEntry[]> {
  try {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(KEY_PREFIX));
    if (keys.length === 0) return [];

    const pairs = await AsyncStorage.multiGet(keys);
    const entries: JournalEntry[] = [];
    for (const [, raw] of pairs) {
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        // A corrupt entry is dropped from the list but LEFT in storage: there
        // is nothing to act on, and deleting it would destroy the only trace
        // that something was once pending.
        if (parsed && typeof parsed === 'object' && typeof parsed.key === 'string') {
          entries.push(parsed as JournalEntry);
        }
      } catch {
        continue;
      }
    }
    return entries.sort((a, b) => b.atMs - a.atMs);
  } catch {
    return [];
  }
}

/**
 * Check every surviving entry against the server.
 *
 * MUST run on a cold process, before any subscription attaches, and `check`
 * MUST bypass the SDK cache — a cache still holding the un-synced echo would
 * report a write as present and clear the journal entry for money that never
 * landed, turning the recovery path into a silent loss.
 *
 * Only `landed` entries are cleared. `missing` ones stay until the operator
 * deals with them, so closing the app does not also close the only record that
 * a payment may be lost.
 */
export async function reconcile(check: ExistenceCheck): Promise<ReconcileResult> {
  const entries = await list();
  const result: ReconcileResult = { landed: [], missing: [], unverified: [] };

  for (const entry of entries) {
    let exists: boolean | null;
    try {
      exists = await check(entry.path);
    } catch {
      exists = null; // could not tell — never "lost"
    }

    if (exists === true) result.landed.push(entry);
    else if (exists === false) result.missing.push(entry);
    else result.unverified.push(entry);
  }

  for (const entry of result.landed) {
    await clear(entry.key);
  }

  return result;
}

/**
 * Run a money write with the journal wrapped around it.
 *
 * `register` is awaited BEFORE the write is issued — that ordering is the whole
 * point, and it is what a crash between the two would otherwise cost.
 *
 * On a REJECTION the entry is cleared, not kept. A rejected promise means the
 * server answered and refused (rules, or a malformed update, both atomic and
 * all-or-nothing), the write definitively did not land, and the caller surfaces
 * the error to the operator. Keeping it would ask them at next launch to
 * re-enter money they already watched fail. The failure this journal is for is
 * the SILENT one: offline, where the promise never settles at all and the entry
 * simply survives.
 *
 * A caller that stops waiting on its own (Session 2's bounded wait) must NOT
 * route that through here as a rejection — an abandoned wait leaves the entry
 * deliberately.
 */
export async function journalled<T>(entry: JournalEntry, work: () => Promise<T>): Promise<T> {
  await register(entry);
  try {
    const result = await work();
    await clear(entry.key);
    return result;
  } catch (err) {
    await clear(entry.key);
    throw err;
  }
}

/**
 * Forget an entry the operator has dealt with — re-entered by hand, or
 * confirmed by looking. Same as `clear`, named for what the caller means.
 */
export async function dismiss(key: string): Promise<void> {
  await clear(key);
}

/** @internal Tests only — the module has process-wide state. */
export async function __resetForTests(): Promise<void> {
  const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(KEY_PREFIX));
  await Promise.all(keys.map((k) => AsyncStorage.removeItem(k)));
}
