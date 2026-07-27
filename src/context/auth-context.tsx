import { applyPersistence, auth } from '@/lib/auth';
import {
  clearSessionKeys,
  getKeepSignedIn,
  getLastActiveAt,
  isExpired,
  setKeepSignedIn,
  setLastActiveAt,
} from '@/lib/session';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

interface AuthContextValue {
  /** The signed-in Firebase user, or null when signed out. */
  user: User | null;
  /** True until the first auth-state result + session check completes. */
  initializing: boolean;
  /** True when the last sign-out was an automatic 48h-idle expiry (calm notice). */
  sessionExpired: boolean;
  clearSessionExpired: () => void;
  signIn: (email: string, password: string, keepSignedIn: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Owns Firebase Auth + session lifetime for the whole app.
 *
 * Session model:
 * - "Keep me signed in" (default): stays signed in across restarts, but is
 *   auto-signed-out after 48h of inactivity. `lastActiveAt` is persisted to
 *   AsyncStorage and checked on launch and on resume, so the timeout survives a
 *   full app close.
 * - Session-only: on web, Firebase `browserSessionPersistence` clears on browser
 *   close. On native, we sign out when the app goes to the **background**, so a
 *   closed app is already signed out and reopening lands on sign-in (no flash of
 *   authed content).
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Ensures the launch-time session check runs only for the first auth result.
  const startupHandled = useRef(false);

  // Sign out + clear persisted session state. `expired` drives the calm notice.
  const endSession = async (expired: boolean) => {
    setUser(null); // clear immediately so no authed frame renders before signOut resolves
    if (expired) setSessionExpired(true);
    try {
      await firebaseSignOut(auth);
    } catch {
      // ignore — user is already treated as signed out locally
    }
    await clearSessionKeys();
  };

  // Subscribe to auth state; run the launch session check behind `initializing`.
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!startupHandled.current) {
        startupHandled.current = true;
        if (u) {
          const keep = await getKeepSignedIn();
          if (keep) {
            // 48h idle expiry.
            if (isExpired(await getLastActiveAt())) {
              await endSession(true);
              setInitializing(false);
              return;
            }
            await setLastActiveAt(Date.now());
          } else if (Platform.OS !== 'web') {
            // Native session-only safety net: if a background sign-out didn't
            // complete before the process was killed, don't restore the user.
            await endSession(false);
            setInitializing(false);
            return;
          }
        }
        setUser(u);
        setInitializing(false);
        return;
      }
      // Runtime changes after startup (sign in / sign out).
      setUser(u);
    });

    return unsubscribe;
  }, []);

  // React to foreground/background transitions for the idle timer + session-only.
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      if (!auth.currentUser) return;

      if (next === 'active') {
        const keep = await getKeepSignedIn();
        if (keep && isExpired(await getLastActiveAt())) {
          await endSession(true);
          return;
        }
        await setLastActiveAt(Date.now());
      } else if (next === 'background') {
        // Record the moment of last use for the idle timer...
        await setLastActiveAt(Date.now());
        // ...and, for native session-only, sign out at background so a closed
        // app is already signed out (no authed flash on reopen).
        if (Platform.OS !== 'web' && !(await getKeepSignedIn())) {
          await endSession(false);
        }
      }
    });

    return () => sub.remove();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      initializing,
      sessionExpired,
      clearSessionExpired: () => setSessionExpired(false),
      signIn: async (email, password, keepSignedIn) => {
        await applyPersistence(keepSignedIn);
        await signInWithEmailAndPassword(auth, email, password);
        await setKeepSignedIn(keepSignedIn);
        await setLastActiveAt(Date.now());
        setSessionExpired(false);
      },
      signOut: async () => {
        await firebaseSignOut(auth);
        await clearSessionKeys();
      },
    }),
    [user, initializing, sessionExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
