import {
  applyPersistence,
  signInWithMagicLink as platformSignInWithMagicLink,
  signInWithPassword as platformSignInWithPassword,
  supabase,
} from '@/lib/auth';
import { bridgeFirebaseAuth, unbridgeFirebaseAuth } from '@/lib/firebase-bridge';
import {
  clearSessionKeys,
  getKeepSignedIn,
  getLastActiveAt,
  isExpired,
  setKeepSignedIn,
  setLastActiveAt,
} from '@/lib/session';
import { actorFrom, type ActivityActor } from '@/services/activity';
import type { Session } from '@supabase/supabase-js';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Last known role per uid. Read on launch to answer `pending` faster, and only
 * ever trusted when it says `staff` — see the note in the role effect.
 */
const ROLE_CACHE_PREFIX = 'bomedia:role:';

/** App role. Set by the owner via allowed_users before a person ever signs in — see supabase/README.md. */
export type Role = 'admin' | 'staff';

/**
 * Minimal, auth-provider-agnostic user shape — deliberately field-for-field
 * identical to the Firebase `User` this replaces (`uid`, `email`,
 * `displayName`), so nothing outside this file and lib/auth.ts had to change:
 * actorFrom (services/activity.ts) and the few other direct `.uid` readers
 * (pending-writes-context.tsx, use-activity.ts) all still typecheck against
 * this unchanged.
 */
export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

function toAppUser(session: Session | null): AppUser | null {
  if (!session?.user) return null;
  const meta = session.user.user_metadata as Record<string, unknown> | undefined;
  const displayName = (meta?.full_name ?? meta?.name ?? null) as string | null;
  return {
    uid: session.user.id,
    email: session.user.email ?? null,
    displayName,
  };
}

interface AuthContextValue {
  /** The signed-in user, or null when signed out. */
  user: AppUser | null;
  /** The user's role, or null while it loads / when signed out. */
  role: Role | null;
  /** `profiles.name` — the source of truth for how this person is named. */
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
  signInWithPassword: (email: string, password: string, keepSignedIn: boolean) => Promise<void>;
  /** Sends the email; completion happens later, out of band — see the module comment. */
  signInWithMagicLink: (email: string, keepSignedIn: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Owns Supabase Auth + session lifetime for the whole app.
 *
 * Session model:
 * - "Keep me signed in" (default): stays signed in across restarts, but is
 *   auto-signed-out after 48h of inactivity. `lastActiveAt` is persisted to
 *   AsyncStorage and checked on launch and on resume, so the timeout survives a
 *   full app close.
 * - Session-only: on web, `sessionOnly` storage (see lib/auth.ts) clears on
 *   browser close. On native, we sign out when the app goes to the
 *   **background**, so a closed app is already signed out and reopening
 *   lands on sign-in (no flash of authed content).
 *
 * Sign-up is closed — accounts exist only via `allowed_users`, seeded by the
 * owner (see supabase/README.md). There is no self-registration path here,
 * unlike the Firebase version this replaces: a user's `profiles` row and
 * role are created by a database trigger the moment `allowed_users` accepts
 * their first sign-in, not by this client.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [profileName, setProfileName] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  // Ensures the launch-time session check runs only for the first auth result.
  const startupHandled = useRef(false);
  // Supabase's own "is anyone signed in" accessor (getSession()) is async;
  // the AppState handler below needs a synchronous answer, so the latest
  // session is mirrored here as onAuthStateChange delivers it — this is what
  // `auth.currentUser` gave the Firebase version for free.
  const sessionRef = useRef<Session | null>(null);

  // Sign out + clear persisted session state. `expired` drives the calm notice.
  const endSession = async (expired: boolean) => {
    setUser(null); // clear immediately so no authed frame renders before signOut resolves
    if (expired) setSessionExpired(true);
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore — user is already treated as signed out locally
    }
    await clearSessionKeys();
  };

  // Subscribe to auth state; run the launch session check behind `initializing`.
  useEffect(() => {
    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, session) => {
      sessionRef.current = session;
      const appUser = toAppUser(session);

      if (!startupHandled.current) {
        startupHandled.current = true;
        if (appUser) {
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
        setUser(appUser);
        setInitializing(false);
        // Fire-and-forget: RTDB writes are still on Firebase, and its rules
        // need a Firebase Auth session that nothing else establishes anymore
        // — see @/lib/firebase-bridge. Never awaited here; it must not slow
        // down sign-in, and a failure surfaces later as its own error.
        if (appUser) void bridgeFirebaseAuth();
        else void unbridgeFirebaseAuth();
        return;
      }
      // Runtime changes after startup (sign in / sign out / token refresh).
      setUser(appUser);
      if (appUser) void bridgeFirebaseAuth();
      else void unbridgeFirebaseAuth();
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  // Native only: complete a magic-link sign-in. `signInWithMagicLink`
  // (@/lib/auth.native.ts) only sends the email — the user leaves the app
  // entirely, and completion happens later, out of band, when they tap the
  // link and the OS hands `bomediasales://auth-callback?code=...` back to
  // this app as a deep link. `detectSessionInUrl: false` there means the
  // Supabase client won't pick this up on its own the way the web client
  // does; this listener is what does, for both cases a deep link can
  // arrive: the app already running (`Linking.addEventListener`) and the
  // app cold-started BY the link (`Linking.getInitialURL()`).
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const handleUrl = async (url: string) => {
      const { path, queryParams } = Linking.parse(url);
      if (path !== 'auth-callback') return; // some other deep link — not ours

      const { params, errorCode } = QueryParams.getQueryParams(url);
      if (errorCode) {
        console.warn('auth-context: magic-link callback returned an error:', errorCode);
        return;
      }
      const code = params.code ?? (queryParams?.code as string | undefined);
      if (!code) return;

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) console.warn('auth-context: exchangeCodeForSession failed:', error);
      // Success needs no further action here — onAuthStateChange (above)
      // fires from this same call and carries the new session forward.
    };

    Linking.getInitialURL().then((url) => {
      if (url) void handleUrl(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => void handleUrl(url));
    return () => sub.remove();
  }, []);

  // Load the user's role AND their profile name from `profiles`. Both are
  // set once, server-side, by the handle_new_user trigger reading
  // allowed_users at signup — there is no client-side self-registration to
  // fall back to (see supabase/migrations). Fail-safe: any error → staff.
  //
  // The name comes out of this same read, deliberately — it is used to
  // attribute sales, payments and every activity entry, so a second fetch
  // would mean a window where the app knows who you are but signs your work
  // as your email address.
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
      // The role is re-read from the database on every launch, so for a
      // second or two after sign-in nobody's role is known and every
      // admin-gated screen sits in `pending` — which is why a staff member
      // opening /cash watched a Daily Cash skeleton for seconds before being
      // redirected.
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
        const { data, error } = await supabase.from('profiles').select('role, name').eq('id', uid).single();
        if (cancelled) return;
        if (error || !data) {
          // The handle_new_user trigger creates this row synchronously as
          // part of the same signup that created the auth.users row, so it
          // should always exist by the time a session does. If it somehow
          // doesn't, fail safe.
          setRole('staff');
          return;
        }
        const resolved: Role = data.role === 'admin' ? 'admin' : 'staff';
        setProfileName(data.name?.trim() || null);
        setRole(resolved);
        void AsyncStorage.setItem(`${ROLE_CACHE_PREFIX}${uid}`, resolved).catch(() => {});
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
      if (!sessionRef.current) return;

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
      signInWithPassword: async (email, password, keepSignedIn) => {
        await applyPersistence(keepSignedIn);
        await setKeepSignedIn(keepSignedIn);
        await setLastActiveAt(Date.now());
        setSessionExpired(false);
        await platformSignInWithPassword(email, password);
      },
      signInWithMagicLink: async (email, keepSignedIn) => {
        await applyPersistence(keepSignedIn);
        // Persisted BEFORE the platform call: web's version of this reloads
        // the page when the user comes back from their email client, which
        // throws away every in-memory value (including what applyPersistence
        // just set) before this app runs again — see lib/auth.ts for how the
        // reloaded page re-derives its storage choice from this same
        // persisted value.
        await setKeepSignedIn(keepSignedIn);
        await setLastActiveAt(Date.now());
        setSessionExpired(false);
        await platformSignInWithMagicLink(email);
      },
      signOut: async () => {
        await supabase.auth.signOut();
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
