import { auth as firebaseAuth } from '@/lib/firebase';
import { supabase } from '@/lib/auth';
import { signInWithCustomToken, signOut as firebaseSignOut } from 'firebase/auth';

/**
 * Establishes a Firebase Auth session mirroring whichever Supabase session
 * is currently live, via the `mint-firebase-token` Edge Function — see that
 * function's own comment for why this exists (RTDB's security rules still
 * require a Firebase Auth session, which nothing has signed into since the
 * auth port) and its revocation caveat. Called from auth-context.tsx
 * whenever a Supabase session appears or refreshes.
 *
 * NEVER THROWS. A failure here must not block sign-in or crash the app —
 * it surfaces later, as a real PERMISSION_DENIED on whichever RTDB write
 * needed the bridge, which is exactly today's failure mode and no worse.
 * Retire this together with the bridge function and RTDB's auth-gated
 * rules, at the db.ts cutover.
 */
export async function bridgeFirebaseAuth(): Promise<void> {
  try {
    const { data, error } = await supabase.functions.invoke<{ token: string }>('mint-firebase-token');
    if (error || !data?.token) {
      console.warn('bridgeFirebaseAuth: mint-firebase-token failed:', error);
      return;
    }
    await signInWithCustomToken(firebaseAuth, data.token);
  } catch (err) {
    console.warn('bridgeFirebaseAuth: could not establish a Firebase session:', err);
  }
}

/** Drops the bridged Firebase session when the Supabase one ends. Best-effort. */
export async function unbridgeFirebaseAuth(): Promise<void> {
  try {
    await firebaseSignOut(firebaseAuth);
  } catch {
    // ignore — mirrors supabase.auth.signOut()'s own try/catch in auth-context.tsx
  }
}
