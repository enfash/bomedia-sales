import { browserLocalPersistence, browserSessionPersistence, getAuth, setPersistence } from 'firebase/auth';
import { app } from './firebase';

/**
 * Web / default Firebase Auth instance. Metro swaps this for `auth.native.ts`
 * on iOS/Android (which wires AsyncStorage persistence).
 */
export const auth = getAuth(app);

/**
 * Web session model: `local` persistence keeps the user across browser restarts;
 * `session` persistence clears when the browser/tab closes (session-only). Must
 * be called before `signInWithEmailAndPassword`.
 */
export async function applyPersistence(keepSignedIn: boolean): Promise<void> {
  await setPersistence(auth, keepSignedIn ? browserLocalPersistence : browserSessionPersistence);
}
