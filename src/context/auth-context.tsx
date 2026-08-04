import { applyPersistence, auth } from '@/lib/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearSessionKeys,
  getKeepSignedIn,
  getLastActiveAt,
  isExpired,
  setKeepSignedIn,
  setLastActiveAt,
} from '@/lib/session';
import { actorFrom, type ActivityActor } from '@/services/activity';
import { dbService } from '@/services/db';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Last known role per uid. Read on launch to answer `pending` faster, and only
 * ever trusted when it says `staff` — see the note in the role effect.
 */
const ROLE_CACHE_PREFIX = 'bomedia:role:';

/** App role. New users self-register as `staff`; the owner promotes to `admin`. */
export type Role = 'admin' | 'staff';

interface AuthContextValue {
  /** The signed-in Firebase user, or null when signed out. */
  user: User | null;
  /** The user's role, or null while it loads / when signed out. */
  role: Role | null;
  /** `users/{uid}.name` — the source of truth for how this person is named. */
  profileName: string | null;
  /**
   * Who to attribute work to. Built once here so no caller can assemble a
   * half-right actor: every sale, payment, void and activity entry signs with
   * this. See `actorFrom` for the fallback chain.
   */
  actor: ActivityActor;
  /** Convenience: role === 'admin'. Staff until proven admin (fail-safe). */
  isAdmin: boolean;
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
  const [role, setRole] = useState<Role | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
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

  // Load the user's role AND their profile name. On first login, self-register
  // as `staff` (the owner promotes to `admin` in the Firebase console).
  // Fail-safe: any error → staff.
  //
  // The name comes out of this same read, deliberately — it is used to attribute
  // sales, payments and every activity entry, so a second fetch would mean a
  // window where the app knows who you are but signs your work as your email
  // address.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) {
          setRole(null);
          setProfileName(null);
        }
        return;
      }
      const uid = user.uid;

      // Fast path, in ONE direction only.
      //
      // The role is re-read from the database on every launch, so for a second
      // or two after sign-in nobody's role is known and every admin-gated screen
      // sits in `pending` — which is why a staff member opening /cash watched a
      // Daily Cash skeleton for seconds before being redirected.
      //
      // A remembered 'staff' is applied immediately; a remembered 'admin' is
      // NOT. Restoring 'staff' can only ever restrict, so a stale cache costs
      // an admin one skeleton — while restoring 'admin' would show admin UI to
      // an account that may since have been demoted, on the strength of this
      // device's memory. The server read follows either way and settles it.
      try {
        const remembered = await AsyncStorage.getItem(`${ROLE_CACHE_PREFIX}${uid}`);
        if (!cancelled && remembered === 'staff') setRole('staff');
      } catch {
        // No cache is simply the slow path.
      }

      try {
        const existing = await dbService.getRecord<{ role?: string; name?: string }>(`users/${uid}`);
        if (cancelled) return;
        if (existing?.role) {
          const resolved: Role = existing.role === 'admin' ? 'admin' : 'staff';
          setProfileName(existing.name?.trim() || null);
          setRole(resolved);
          void AsyncStorage.setItem(`${ROLE_CACHE_PREFIX}${uid}`, resolved).catch(() => {});
          return;
        }
        const name = user.displayName ?? '';
        await dbService.setRecord(`users/${uid}`, {
          role: 'staff',
          email: user.email ?? '',
          name,
          createdAt: new Date().toISOString(),
        });
        if (!cancelled) {
          setProfileName(name.trim() || null);
          setRole('staff');
          void AsyncStorage.setItem(`${ROLE_CACHE_PREFIX}${uid}`, 'staff').catch(() => {});
        }
      } catch {
        if (!cancelled) setRole('staff');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

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
      role,
      profileName,
      actor: actorFrom(user, profileName),
      isAdmin: role === 'admin',
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
    [user, role, profileName, initializing, sessionExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
