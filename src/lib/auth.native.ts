import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as AuthSession from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import * as WebBrowser from 'expo-web-browser';
import type { Database } from '@/types/supabase';

// Dismisses the in-app browser sheet once the OS hands control back to the
// app via the deep-link redirect. Required once at module scope per
// Supabase's documented Expo pattern — without it, Android can leave the
// auth browser sheet stuck open after a successful sign-in.
WebBrowser.maybeCompleteAuthSession();

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
    // The OAuth result arrives via WebBrowser.openAuthSessionAsync's return
    // value in signInWithGoogle below, not by the app itself loading a URL —
    // there's no browser-location for the client to inspect.
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

/**
 * Opens Google's consent screen in the OS browser (Google blocks OAuth
 * inside an embedded WebView) and captures the app's own deep-link redirect
 * back — Supabase's documented Expo pattern:
 * https://supabase.com/docs/guides/auth/native-mobile-deep-linking
 *
 * Requires a development build; Expo Go cannot reliably intercept a custom
 * URL scheme redirect. See README.md → "Google sign-in redirect URLs".
 */
export async function signInWithGoogle(): Promise<void> {
  const redirectTo = AuthSession.makeRedirectUri({ scheme: 'bomediasales', path: 'auth-callback' });

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('Supabase did not return a Google sign-in URL.');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') {
    // User backed out of the browser sheet (back button / swipe-dismiss) —
    // not an error, just no session; the sign-in screen stays put.
    return;
  }

  const { params, errorCode } = QueryParams.getQueryParams(result.url);
  if (errorCode) throw new Error(errorCode);
  if (!params.code) throw new Error('Google sign-in did not return an authorization code.');

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(params.code);
  if (exchangeError) throw exchangeError;
}
