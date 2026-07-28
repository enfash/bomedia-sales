import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
import * as firebaseAuth from 'firebase/auth';
import { app } from './firebase';

/**
 * Native Firebase Auth instance with AsyncStorage persistence so the session
 * survives app restarts. `getReactNativePersistence` only exists in Firebase's
 * React Native entry (which Metro resolves for native); tsc sees the web types
 * that omit it, so we reach it loosely to keep the typecheck green.
 */
const getReactNativePersistence = (
  firebaseAuth as unknown as { getReactNativePersistence?: (storage: unknown) => unknown }
).getReactNativePersistence;

let auth: Auth;
try {
  auth = initializeAuth(
    app,
    getReactNativePersistence
      ? ({ persistence: getReactNativePersistence(AsyncStorage) } as Parameters<typeof initializeAuth>[1])
      : undefined,
  );
} catch {
  // Already initialized (e.g. Fast Refresh re-ran this module) — reuse it.
  auth = getAuth(app);
}

/**
 * Native persistence is AsyncStorage-backed and fixed. Session-only ("closing
 * logs me out") can't be expressed to Firebase here, so it's emulated in the
 * AuthProvider by signing out when the app goes to the background. No-op here to
 * keep the cross-platform `signIn` API identical.
 */
export async function applyPersistence(_keepSignedIn: boolean): Promise<void> {
  // intentionally empty — see AuthProvider for the native session-only behaviour
}

export { auth };
