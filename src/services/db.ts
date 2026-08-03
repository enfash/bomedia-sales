import { auth } from '@/lib/auth';
import { DATABASE_URL, db } from '@/lib/firebase';
import { endAt, get, increment, onValue, orderByChild, orderByKey, push, query, ref, remove, set, startAt, update } from 'firebase/database';

/**
 * Firebase Realtime Database Service Wrapper
 * Encapsulates direct firebase references out of UI components.
 */

/**
 * Firebase RTDB rejects writes that contain `undefined` anywhere in the value
 * (e.g. an optional `type` field carried through as `type: undefined`). Deep-strip
 * undefined keys before every write so this class of error can't happen.
 */
function stripUndefined<T>(value: T): T {
  // Server-value sentinels (increment) are opaque objects the SDK resolves
  // server-side. Recursing into them would strip their internals.
  if (value && typeof value === 'object' && '.sv' in (value as any)) return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

export const dbService = {
  /**
   * Reads data from a specific path
   */
  async getRecord<T>(path: string): Promise<T | null> {
    const snapshot = await get(ref(db, path));
    return snapshot.exists() ? snapshot.val() as T : null;
  },

  /**
   * Sets data at a specific path (overwrites)
   */
  async setRecord(path: string, data: any): Promise<void> {
    await set(ref(db, path), stripUndefined(data));
  },

  /**
   * Updates data at a specific path (merges)
   */
  async updateRecord(path: string, data: any): Promise<void> {
    await update(ref(db, path), stripUndefined(data));
  },

  /**
   * Pushes a new record to a list (generates ID)
   * @returns The generated unique key
   */
  async pushRecord(path: string, data: any): Promise<string | null> {
    const newRef = push(ref(db, path));
    await set(newRef, stripUndefined(data));
    return newRef.key;
  },

  /**
   * Generate a push key WITHOUT writing, so the caller can include the key in a
   * multi-path update. Keys are produced client-side, so this needs no round
   * trip and works offline.
   */
  newKey(path: string): string {
    const key = push(ref(db, path)).key;
    if (!key) throw new Error(`Could not generate a key under ${path}`);
    return key;
  },

  /**
   * Atomic multi-path update from the database root.
   *
   * Every path in `updates` is applied or none of them are. This is the only
   * safe way to write a value alongside a counter it must agree with — two
   * sequential writes can leave the pair inconsistent forever if the second
   * fails.
   *
   * Paths are absolute and slash-separated, e.g.
   *   { 'payments/2026-08-01/uid/-Nx…': entry,
   *     'sales/2026/08/01/INV-…/totalPaid': dbService.increment(5000) }
   */
  async updateAtomic(updates: Record<string, any>): Promise<void> {
    await update(ref(db), stripUndefined(updates));
  },

  /**
   * Server-side atomic increment.
   *
   * Applied by the server, so two devices incrementing the same counter both
   * land — unlike a client-side read-modify-write, where the second write
   * silently overwrites the first. Offline, the SDK resolves it locally as an
   * estimate and re-applies it atomically on reconnect.
   */
  increment(delta: number) {
    return increment(delta);
  },

  /**
   * Subscribe to a KEY RANGE under a path, inclusive.
   *
   * For date-bucketed nodes whose keys are `YYYY-MM-DD`, lexicographic key
   * order is chronological order, so this scopes a read to a window without
   * any `.indexOn` — `orderByKey` is always indexed. That is a deliberate
   * property of the bucket naming, not a coincidence.
   */
  subscribeToKeyRange<T>(
    path: string,
    startKey: string,
    endKey: string,
    callback: (data: T | null) => void,
  ) {
    const q = query(ref(db, path), orderByKey(), startAt(startKey), endAt(endKey));
    return onValue(q, (snapshot) => callback(snapshot.exists() ? (snapshot.val() as T) : null));
  },

  /**
   * Removes data at a specific path
   */
  async removeRecord(path: string): Promise<void> {
    await remove(ref(db, path));
  },

  /**
   * Subscribes to real-time changes at a specific path
   * @returns Unsubscribe function
   */
  /**
   * Does this node exist ON THE SERVER? `true` / `false` / `null` = could not tell.
   *
   * Deliberately NOT `get()`. The SDK serves `get()` from its in-memory cache
   * when a listener is attached, and that cache still holds the local echo of a
   * write that never reached the server — so an un-synced payment would report
   * as present and the pending-journal entry protecting it would be cleared.
   * That turns the recovery path into a silent loss, which is the whole failure
   * this exists to catch.
   *
   * A REST read bypasses the SDK entirely, so the answer cannot come from a
   * cache no matter when this is called. `shallow=true` returns `true` for a
   * node with children instead of downloading it.
   *
   * Rules apply — it authenticates as the signed-in user, not as an owner, so
   * a node the user may not read answers `null` (unknown) rather than `false`.
   * Never report a write lost on the strength of a read that could not run.
   */
  async existsOnServer(path: string): Promise<boolean | null> {
    try {
      const user = auth.currentUser;
      if (!user) return null;
      const token = await user.getIdToken();
      const clean = path.replace(/^\/+/, '');
      const url = `${DATABASE_URL}/${clean}.json?shallow=true&auth=${encodeURIComponent(token)}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const body = (await response.text()).trim();
      return body !== 'null' && body !== '';
    } catch {
      // Offline, DNS failure, expired token — all "could not tell".
      return null;
    }
  },

  subscribe<T>(path: string, callback: (data: T | null) => void) {
    const dbRef = ref(db, path);
    return onValue(dbRef, (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() as T : null);
    });
  },

  /**
   * Subscribes to a query (e.g. ordered lists)
   * @returns Unsubscribe function
   */
  subscribeQuery<T>(path: string, orderChild: string, callback: (data: T | null) => void) {
    const q = query(ref(db, path), orderByChild(orderChild));
    return onValue(q, (snapshot) => {
      callback(snapshot.exists() ? snapshot.val() as T : null);
    });
  }
};
