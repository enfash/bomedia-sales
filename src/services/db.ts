import { db } from '@/lib/firebase';
import { get, onValue, orderByChild, push, query, ref, remove, set, update } from 'firebase/database';

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
   * Removes data at a specific path
   */
  async removeRecord(path: string): Promise<void> {
    await remove(ref(db, path));
  },

  /**
   * Subscribes to real-time changes at a specific path
   * @returns Unsubscribe function
   */
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
