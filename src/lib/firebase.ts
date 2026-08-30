import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

/**
 * The database the app talks to.
 *
 * NOT the project's default instance — the project has two, and
 * `bomedia-official-default-rtdb` is empty. Stated once and reused, because the
 * two literals that used to say this drifted from `firebase.json`, which named
 * neither: the security rules were deployed to the empty database for months
 * while this one sat open to any signed-in user. See docs/DATABASE_RUNBOOK.md.
 */
export const DATABASE_URL = 'https://bomedia-official.firebaseio.com';

const firebaseConfig = {
  apiKey: "AIzaSyBy_iuT-YwyqyQwsa67_a6_0mmGtWdmgno",
  authDomain: "bomedia-official.firebaseapp.com",
  databaseURL: DATABASE_URL,
  projectId: "bomedia-official",
  storageBucket: "bomedia-official.firebasestorage.app",
  messagingSenderId: "1054405810396",
  appId: "1:1054405810396:web:21cf8769eb3ef6de3abc19",
  // measurementId: "G-ZRX1NW30VV"
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Realtime Database and get a reference to the service
const db = getDatabase(app, DATABASE_URL);

/**
 * Firebase Auth — NOT what the app signs in with anymore (that's Supabase
 * Auth, see @/lib/auth). Kept alive only as the bridge target for
 * `mint-firebase-token` (see auth-context.tsx and that function's own
 * comment): RTDB's security rules still gate on a Firebase Auth session
 * existing, so this is what `signInWithCustomToken` signs into once the
 * bridge hands back a token. Retire this export together with the bridge,
 * at the db.ts cutover.
 */
const auth = getAuth(app);

/**
 * Delays attaching an RTDB listener until a Firebase Auth session actually
 * exists, and re-attaches it (after tearing the previous one down) whenever
 * the session goes away and comes back.
 *
 * WHY THIS EXISTS. `mint-firebase-token`'s bridge (see firebase-bridge.ts)
 * runs fire-and-forget from an auth state change — it does not, and must
 * not, block sign-in. A component that calls `onValue` unconditionally on
 * mount (as settings-context.tsx did) can lose the race: the listener
 * attaches while `auth.currentUser` is still null, RTDB's rules deny it,
 * and — this is the part that makes it a real bug, not a cosmetic one —
 * the RTDB JS SDK does NOT silently retry a listener cancelled by
 * PERMISSION_DENIED. It stays cancelled until something calls `onValue`
 * again. A single console.error at startup was actually "this screen never
 * loads its data again for the rest of the session."
 *
 * `attach()` should call the real `onValue`/`get`-based subscribe and
 * return its own unsubscribe function.
 */
export function whenFirebaseAuthed(attach: () => () => void): () => void {
  let detachCurrent: (() => void) | null = null;
  let cancelled = false;

  const unsubscribeAuth = onAuthStateChanged(auth, (fbUser) => {
    if (cancelled) return;
    if (fbUser) {
      if (!detachCurrent) detachCurrent = attach();
    } else if (detachCurrent) {
      detachCurrent();
      detachCurrent = null;
    }
  });

  return () => {
    cancelled = true;
    unsubscribeAuth();
    if (detachCurrent) detachCurrent();
  };
}

export { app, auth, db };
