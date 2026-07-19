import { ref, get, set, update, push, remove, onValue, query, orderByChild, DataSnapshot } from 'firebase/database';
import { db } from '@/lib/firebase';

/**
 * Firebase Realtime Database Service Wrapper
 * Encapsulates direct firebase references out of UI components.
 */

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
    await set(ref(db, path), data);
  },

  /**
   * Updates data at a specific path (merges)
   */
  async updateRecord(path: string, data: any): Promise<void> {
    await update(ref(db, path), data);
  },

  /**
   * Pushes a new record to a list (generates ID)
   * @returns The generated unique key
   */
  async pushRecord(path: string, data: any): Promise<string | null> {
    const newRef = push(ref(db, path));
    await set(newRef, data);
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
