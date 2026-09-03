import { createClient } from '@supabase/supabase-js';
import { KEEP_KEY } from '@/lib/session';
import type { Database } from '@/types/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. See README.md → "Local development" for the values `supabase start` prints.',
  );
}

/**
 * Web session model, mirroring the Firebase persistence choice it replaces:
 * "keep me signed in" (the default) survives browser restarts; unchecking it
 * drops to sessionStorage, which clears when the tab/browser closes.
 *
 * Supabase fixes its storage adapter at client-creation time — there is no
 * `setPersistence()` to call later, the way Firebase Auth had. `sessionOnly`
 * is the workaround: every storage call reads it live, so `applyPersistence`
 * can still change where the *next* write lands.
 *
 * That alone isn't enough for magic-link sign-in specifically:
 * `signInWithMagicLink` sends the user away to their email client and back
 * to this same origin days, hours, or seconds later — a real page reload,
 * which throws away every JS module's in-memory state (including whatever
 * `applyPersistence` had just set) before this module runs again from
 * scratch on the page that comes back. So `sessionOnly` has to be
 * RE-SEEDED on load, synchronously, before `createClient` below starts
 * using it (Supabase reads the URL's auth result and writes the new
 * session as part of that same call). AsyncStorage's own getter is async
 * and can't run in time; reading window.localStorage directly can, because
 * AsyncStorage's web implementation is a Promise wrapper around exactly
 * that same storage. `signInWithMagicLink` (below) is what persists the
 * choice here in the first place, before it sends the email that leads to
 * the reload. Email/password sign-in never reloads the page at all, so
 * this re-seeding is moot for it — but it's the same client either way.
 */
let sessionOnly = typeof window !== 'undefined' && window.localStorage.getItem(KEEP_KEY) === 'false';

// `web.output: "static"` (app.json) means Expo Router renders this app once
// in Node before it ever reaches a browser — createClient below eagerly
// tries to load a persisted session as part of construction, which calls
// these methods during that Node render pass. There's no window there (and
// no session to have persisted server-side anyway), so each method has to
// check for one rather than assume it, the way `sessionOnly`'s own
// initializer above already does.
const webStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    return (sessionOnly ? window.sessionStorage : window.localStorage).getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window === 'undefined') return;
    (sessionOnly ? window.sessionStorage : window.localStorage).setItem(key, value);
  },
  removeItem: (key: string) => {
    if (typeof window === 'undefined') return;
    (sessionOnly ? window.sessionStorage : window.localStorage).removeItem(key);
  },
};

/**
 * Web / default Supabase client. Metro swaps this for `auth.native.ts` on
 * iOS/Android (which wires an AsyncStorage adapter instead).
 */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: webStorage,
    persistSession: true,
    autoRefreshToken: true,
    // The browser lands back on this same page with Google's result already
    // in the URL after signInWithGoogle() redirects away and back; this is
    // what completes the sign-in on that reload, with no callback route to
    // build or maintain.
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

/** Must be called before `signInWithMagicLink` — see the storage note above. */
export async function applyPersistence(keepSignedIn: boolean): Promise<void> {
  sessionOnly = !keepSignedIn;
}

/**
 * Password sign-in. No redirect, no reload — the session is established as
 * part of this call returning, same as any other API request.
 */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Sends a magic-link email, then relies on `detectSessionInUrl: true`
 * (above) to complete the sign-in when the user clicks it and lands back on
 * this same origin with the auth result in the URL — no callback route to
 * build or maintain, same mechanism Google OAuth used to rely on here.
 *
 * `shouldCreateUser` is left at its default (`true`) deliberately: a
 * request for someone on `allowed_users` who has never signed in yet still
 * needs to create their `auth.users` row on this first request, gated by
 * `reject_unlisted_signup` the same way first-time Google sign-in was —
 * `false` here would also block THEM, not just uninvited emails.
 */
export async function signInWithMagicLink(email: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}
