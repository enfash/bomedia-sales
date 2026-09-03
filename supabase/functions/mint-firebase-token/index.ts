import { createClient } from "npm:@supabase/supabase-js@^2";
import { cert, getApps, initializeApp, type App } from "npm:firebase-admin@^12/app";
import { getAuth } from "npm:firebase-admin@^12/auth";

/**
 * Mints a Firebase custom token for the caller's already-verified Supabase
 * session, with uid = Supabase user id — so Firebase RTDB's `auth.uid`-keyed
 * security rules resolve against the same identity the rest of the app now
 * uses everywhere else.
 *
 * WHY THIS EXISTS. `sales`/`quotes`/`payments`/`waste_log` still live on
 * Firebase RTDB, and its rules still gate every write on a live Firebase
 * Auth session (`auth != null`, then a `users/{auth.uid}/role` lookup). The
 * auth port moved sign-in entirely to Supabase Auth — nothing signs into
 * Firebase Auth anymore, so `auth` is `null` on every request and every one
 * of those writes now fails PERMISSION_DENIED. This bridges that gap for as
 * long as it exists. It is NOT a long-term fixture — retire this function,
 * `database.rules.json`'s auth-gated rules, and the client-side call to it
 * (see `src/context/auth-context.tsx`) together, at the db.ts cutover
 * (`supabase/README.md` → "Cutover plan").
 *
 * WHAT IT DOES, on every call:
 *   1. Verifies the caller's Supabase access token (defence in depth: the
 *      function's own `verify_jwt = true` config already makes the platform
 *      reject an unauthenticated call before this code runs at all).
 *   2. Looks up their role from `profiles` (the real source of truth now —
 *      see `20260829150000_allowed_users.sql`), as themselves, under RLS.
 *      Refuses (403) if they have no profile — `handle_new_user()` only
 *      ever creates one for an `allowed_users` email, so no profile means
 *      no access, not "default to staff".
 *   3. Mirrors that role into RTDB's `users/{uid}` node — bypasses RTDB
 *      rules entirely, the one privileged step. This keeps RTDB's
 *      authorization view in sync with `profiles.role` on every sign-in,
 *      rather than relying on RTDB's own "$uid can self-register as staff
 *      once" rule, which has no way to grant admin and no way to reflect a
 *      role change or revocation.
 *
 *      NOT done via `firebase-admin/database`'s `.ref().set()` — that hangs
 *      indefinitely in this runtime (Supabase Edge Functions' Deno
 *      sandbox), confirmed by isolating it with a bounded race: `.set()`
 *      never resolved or rejected inside an 8s window, while
 *      `createCustomToken()` (below, same Admin SDK, same request)
 *      returned in 4ms. The RTDB client submodule apparently depends on a
 *      connection mechanism this sandbox doesn't support; nothing about
 *      the credential, the network, or the write itself was the problem —
 *      a plain outbound `fetch()` to the same database's REST endpoint
 *      from this same runtime answers in under a second. So this mints a
 *      short-lived OAuth2 access token from the service-account credential
 *      directly (`credential.getAccessToken()` — a local, no-RTDB-SDK
 *      operation) and does the write as a plain authenticated REST `PUT`
 *      instead. Same privilege (a Google-signed admin token bypasses RTDB
 *      rules the same way the Admin SDK does), different transport.
 *   4. Mints and returns a Firebase custom token for that same uid.
 *
 * REVOCATION CAVEAT — read before relying on this for anything but the
 * transitional period it's built for. Revoking someone via `revoke_user()`
 * stops them getting a NEW custom token (step 2 fails once their profile
 * is gone) and, on their NEXT write, the `users/{uid}/role` lookup still
 * matches the OLD mirrored value from their last sign-in until something
 * overwrites or deletes it — this function only refreshes that mirror when
 * called, it does not push a change out. A Firebase ID token they already
 * hold also keeps self-refreshing on its own schedule; nothing here calls
 * `revokeRefreshTokens()`. Until that gap is closed (or RTDB retired),
 * offboarding someone who has used the app must also delete their
 * `users/{uid}` node from RTDB by hand — see supabase/README.md.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const FIREBASE_DATABASE_URL = "https://bomedia-official.firebaseio.com";

// The web build calls this function from the browser (see firebase-bridge.ts),
// which sends a CORS preflight OPTIONS request before the real POST. Without
// these headers on every response — including the preflight and every error
// path below — the browser blocks the request before this code even runs,
// `supabase.functions.invoke` surfaces that as a generic error, and the
// caller never learns why: it just looks like the bridge silently timed out
// (see `whenFirebaseAuthed` in src/lib/firebase.ts). Native callers are
// unaffected (CORS is a browser mechanism only) — this only ever mattered
// once the app started being tested against a hosted project from a browser.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function firebaseAdmin(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0]!;

  const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
  if (!serviceAccountJson) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not set");
  }
  return initializeApp({
    credential: cert(JSON.parse(serviceAccountJson)),
    databaseURL: FIREBASE_DATABASE_URL,
  });
}

/**
 * Writes `users/{uid}` in RTDB as a plain authenticated REST call, not
 * `firebase-admin/database` — see the module comment's step 3 for why.
 * `app.options.credential` is the same `cert(...)` credential the app was
 * initialized with; `getAccessToken()` mints a short-lived Google OAuth2
 * token locally (no RTDB SDK involved), which RTDB's REST API accepts as a
 * Bearer token with the same rule-bypassing privilege the Admin SDK has.
 */
async function writeRtdbRole(app: App, uid: string, role: string): Promise<void> {
  const accessToken = await app.options.credential!.getAccessToken();
  const res = await fetch(`${FIREBASE_DATABASE_URL}/users/${uid}.json`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken.access_token}` },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    throw new Error(`RTDB write failed: ${res.status} ${await res.text()}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return new Response(JSON.stringify({ error: "missing bearer token" }), {
      status: 401,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  // One client, two jobs: `.auth.getUser(token)` verifies the token against
  // GoTrue directly; the same `Authorization` header on every later `.from()`
  // call makes that query run AS this user, under RLS — not as anon.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "invalid session" }), {
      status: 401,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }
  const uid = userData.user.id;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", uid)
    .single();

  if (profileError || !profile) {
    return new Response(JSON.stringify({ error: "not provisioned" }), {
      status: 403,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }
  const role = profile.role === "admin" ? "admin" : "staff";

  let customToken: string;
  try {
    const app = firebaseAdmin();
    await writeRtdbRole(app, uid, role);
    customToken = await getAuth(app).createCustomToken(uid);
  } catch (err) {
    console.error("mint-firebase-token: Firebase Admin call failed:", err);
    return new Response(JSON.stringify({ error: "token mint failed" }), {
      status: 502,
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  }

  return new Response(JSON.stringify({ token: customToken }), {
    status: 200,
    headers: { "content-type": "application/json", ...corsHeaders },
  });
});
