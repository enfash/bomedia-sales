import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as AuthSession from 'expo-auth-session';
import type { Database } from '@/types/supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. See README.md → "Local development" for the values `supabase start` prints.',
  );
}

/**
 * Native Supabase client with AsyncStorage persistence so the session
 * survives app restarts. AsyncStorage, not SecureStore: this codebase
 * already puts Firebase's ID/refresh tokens in AsyncStorage (see the
 * `getReactNativePersistence(AsyncStorage)` this file replaces) — the same
 * class of secret, the same storage, not a new exposure. SecureStore's
 * ~2KB-per-key limit on iOS Keychain is also a real risk for a Supabase
 * session, which bundles an access token, a refresh token, and the user's
 * metadata into one stored value that can outgrow it.
 */
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    // The magic-link result arrives via a deep link the OS hands to this
    // app directly (see @/context/auth-context.tsx's Linking listener),
    // not by this client inspecting a browser location — there is no
    // browser-location here to detect a session in.
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

/**
 * Native has no equivalent to browser local-vs-session storage — AsyncStorage
 * persistence is fixed once the client is created. Session-only ("closing
 * logs me out") is emulated in the AuthProvider instead, by signing out when
 * the app goes to the background — same as the Firebase version this
 * replaces. No-op here to keep the cross-platform signIn API identical.
 */
export async function applyPersistence(_keepSignedIn: boolean): Promise<void> {
  // intentionally empty — see AuthProvider for native session-only behaviour
}

/** Password sign-in. No redirect, no deep link — the session is established directly. */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/**
 * Sends a magic-link email. The user leaves this app entirely (opens their
 * email client) — completion happens later, out of band, when they tap the
 * link and the OS hands `bomediasales://auth-callback?code=...` back to
 * this app. See `auth-context.tsx`'s `Linking` listener for that half; this
 * function's job ends once the email is sent.
 *
 * `AuthSession.makeRedirectUri` is called HERE, inside the function, not at
 * module scope — it resolves the current native scheme context (Expo Go /
 * dev build / standalone), which isn't available at plain module-import
 * time (breaks under Jest, which has no such context). Same reason the old
 * Google OAuth flow computed its redirect URI inside `signInWithGoogle`
 * rather than as a top-level constant.
 *
 * `shouldCreateUser` left at its default (`true`) — see the web version's
 * comment for why: blocking it would also block a first-time sign-in for
 * someone genuinely on `allowed_users`, not just uninvited emails.
 *
 * Requires a development build; Expo Go cannot reliably intercept a custom
 * URL scheme redirect (same requirement Google OAuth had here).
 */
export async function signInWithMagicLink(email: string): Promise<void> {
  const redirectTo = AuthSession.makeRedirectUri({ scheme: 'bomediasales', path: 'auth-callback' });
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw error;
}
