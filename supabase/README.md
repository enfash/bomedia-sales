# Supabase — auth & local development

This app signs in with **email/password or a magic link**, via Supabase
Auth — Google OAuth was the original sign-in method, removed entirely (see
"Sign-in methods" below for why and what changed). Sign-up is **closed**:
there is no self-registration screen anywhere in the app. Accounts are
provisioned by the owner, one email at a time, before that person ever
opens the app — see "Adding a user" below.

## Local development

`npx supabase start` prints the values this app needs as
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`
(`API_URL` / `ANON_KEY` in its output). Put them in `.env.local` at the repo
root (gitignored) — Expo loads `EXPO_PUBLIC_*` vars from there automatically:

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<the anon key supabase start printed>
```

The anon key is safe to commit or share — it's meant to be embedded in the
client bundle, and RLS is what actually protects data, not the key's
secrecy. `.env.example` at the repo root has the same two variable names
with empty values as a template for the hosted project's keys.

Every migration runs on `npx supabase db reset`, including
`20260829150000_allowed_users.sql`, which seeds `elijahfasugba@gmail.com` as
`admin` — otherwise closing signup would lock out the very first sign-in. To
seed a different owner (a fork, a different environment), edit that one
`insert` statement before the first `db reset` against it.

## Sign-in methods

**Google OAuth was removed entirely** — no third sign-in option kept
alongside the two below, no fallback, no Google Cloud Console dependency
anywhere in this app anymore. `src/lib/auth.ts`/`auth.native.ts` no longer
import `expo-web-browser` (the in-app browser session OAuth needed to open
Google's consent screen and capture its redirect); `expo-auth-session` is
still a dependency, now only for `makeRedirectUri`'s magic-link URI. Why:
Google Console setup (a registered OAuth client, a redirect URI, a
production-vs-test-client distinction) was friction with no benefit for a
handful of staff who already have an email — see the two methods below,
neither of which needs any of that.

**Email/password.** `supabase.auth.signInWithPassword({email, password})`
— no redirect, no deep link, the session is established as part of the
call returning. Provisioning someone a password is a real manual step (see
"Adding a user" below) — there is no password-reset-by-email flow wired up
here, so a forgotten password currently means re-provisioning, not
recovering.

**Magic link.** `supabase.auth.signInWithOtp({email})` sends an email; the
person clicks it and is signed in without ever typing a password. Simpler
to provision (no password to generate or distribute — see "Adding a user"),
but depends on email actually arriving. **Free-tier / no-custom-SMTP
caveat**: Supabase's built-in email sending is rate-limited (a handful of
emails per hour) and explicitly meant for testing, not production volume —
fine for a small shop's occasional sign-ins, but if two people request
magic links back to back, whoever's second is stuck until the limit resets.
Configure custom SMTP (Dashboard → Authentication → Emails) before relying
on this for real operations.

Completion works differently by platform, both already wired:
- **Web**: `detectSessionInUrl: true` (already the client's config) picks
  up the magic-link result automatically when the browser reloads at the
  redirect URL — no callback route needed, same mechanism Google OAuth
  used to rely on here.
- **Native**: there is no in-app browser session to capture a result from
  (the person leaves the app entirely, opens their email client) — the
  link deep-links `bomediasales://auth-callback?code=...` back into the
  app directly. `src/context/auth-context.tsx` listens for this via
  `expo-linking` (`Linking.getInitialURL()` for a cold start,
  `Linking.addEventListener('url', …)` for the app already running) and
  calls `exchangeCodeForSession` itself — deliberately NOT a routed Expo
  Router screen: `AuthGate` (`src/app/_layout.tsx`) shows the sign-in
  screen for *any* route while `user` is null, which is always true when a
  magic-link callback arrives, so a routed `/auth-callback` screen would
  never actually mount. **Testing on a physical device or simulator
  requires a development build** (`expo run:ios` / `expo run:android` or
  an EAS dev build) — Expo Go cannot reliably intercept a custom URL
  scheme redirect, so the deep link will appear to hang or silently fail
  there. Same requirement Google OAuth had.

`[auth]` in `supabase/config.toml` (or the hosted Dashboard's Authentication
→ URL Configuration → Redirect URLs) still needs `bomediasales://auth-callback`
registered — that part of the old Google setup carries over unchanged, it
was never Google-specific, just this app's own redirect target.

## Adding a user

There is no in-app "invite" flow. Add the email before telling the person to
sign in — if they try first, `reject_unlisted_signup` (see
`20260829150000_allowed_users.sql`) rejects the sign-in outright:

```sql
insert into allowed_users (email, role) values ('someone@example.com', 'staff');
-- or 'admin', for a second admin account
```

Run this against the project's SQL editor (Studio, or the hosted
dashboard's) or via `psql`/`supabase db execute` connected as a role that
bypasses RLS (e.g. the `postgres` role, or the dashboard's own connection) —
`allowed_users` is admin-only under RLS (no staff read or write at all), so
an already-signed-in admin session works too, but the very first admin has
to be seeded by migration, not by a query, since nobody can be an admin
session yet.

**That's the whole job for magic-link sign-in** — the allowlist row alone.
The person requests a magic link with that email whenever they first try to
sign in, and `reject_unlisted_signup` is what actually decides whether that
succeeds — same protection Google OAuth's first sign-in had.

**Password sign-in needs one more step**, since there's no password to
generate on its own: create the `auth.users` row yourself, with a password,
via the Admin API — never from client code, this needs the service role
key:

```bash
curl -X POST '<SUPABASE_URL>/auth/v1/admin/users' \
  -H "apikey: <service_role_key>" -H "Authorization: Bearer <service_role_key>" \
  -H "Content-Type: application/json" \
  -d '{"email":"someone@example.com","password":"<a real password>","email_confirm":true,"user_metadata":{"full_name":"Their Name"}}'
```

`email_confirm: true` skips the confirmation-email step (this app has no
use for it — the owner is provisioning a known person, not verifying an
unknown signup). `user_metadata.full_name` is what `handle_new_user`
sources their `profiles.name` from — without it, their name falls back to
their email address until they (or an admin) update it (see
`20260829150000_allowed_users.sql`'s `handle_new_user`). Get the resulting
password to that person through whatever channel you'd trust with a
password generally — there's no invite-email flow wired up here.

Removing access is the whole job now, not just the future-signups half of
it — see "Offboarding" below.

## Offboarding

Deleting a row from `allowed_users` — by `revoke_user()`, by a direct
`delete`, or through the Table Editor — does the full job: it blocks a new
sign-in immediately, and it stops an already-signed-in session from
refreshing.

```sql
select revoke_user('someone@example.com');
```

Run this the same way as adding a user (SQL editor, `psql`, or an
already-signed-in admin session — `revoke_user` checks admin status itself,
so any of those work). Deleting the row directly does the same thing:

```sql
delete from allowed_users where email = 'someone@example.com';
```

Both paths refuse to remove the last remaining admin — the delete raises
instead, changing nothing, so there's no way to lock yourself out this way.

**What happens to their existing session:**

1. `allowed_users` row deleted — a fresh sign-in with that email is rejected
   from this instant (`reject_unlisted_signup`).
2. Their `auth.users` row is banned (`banned_until` set far in the future)
   and every one of their sessions and refresh tokens is deleted — their
   *next* token refresh fails immediately, however soon that is.
3. Their `auth.users` row itself is then deleted too — **if** they have no
   sales, payments, expenses, waste log entries, or quotes attributed to
   them. Those tables' `logged_by`/`collected_by`/`created_by` columns
   reference `auth.users(id)` with no `ON DELETE` action, on purpose — a
   ledger entry must never lose who created it. In practice this means most
   real staff *can't* have their `auth.users` row fully deleted (that's the
   job — they've logged something), and step 3 fails with a `WARNING`
   (visible in the SQL editor / psql output, not an error — steps 1 and 2
   above already happened and still hold). Their account and history remain
   for audit; they cannot sign in or refresh a session again regardless.

**How long an already-issued access token stays valid:** step 2 stops the
*next* refresh, not tokens already handed out — a JWT is self-contained and
verified by its signature, so nothing server-side can invalidate one early.
Whatever access token they were holding at the moment of revocation keeps
working until it expires on its own: **up to `jwt_expiry` seconds** from
whenever it was last issued or refreshed — `3600` (1 hour) in
`supabase/config.toml` for local dev, same value the hosted project should
carry under *Authentication → Settings → JWT expiry limit*. Worst case, if
they'd just refreshed the instant before being revoked, that's the full
window; best case, seconds. There is no dashboard action or SQL that
shortens this — only a shorter `jwt_expiry` project-wide narrows the window
for everyone, at the cost of more frequent refreshes for every active
session.

**Plainly: until cutover, steps 1–3 above do NOT fully revoke someone. You
must also delete `users/{their-supabase-uid}` from the Firebase Realtime
Database, by hand, via the Firebase console or REST — and that manual
deletion is the ONLY thing that closes this hole.** `mint-firebase-token`
mirrors a role into that RTDB node on sign-in (see "Firebase Auth bridge"
below), and nothing automated deletes it on revocation: not `revoke_user()`,
not the JWT-expiry window in steps 1–3, nothing. A Firebase Auth session
someone already holds keeps refreshing on its own schedule (not bounded by
`jwt_expiry` — that's a Supabase setting, and this is a different, separate
Firebase session) and keeps satisfying RTDB's `role` check on every write
for as long as that RTDB node exists — which, left alone, is indefinitely.
Skipping this step means a revoked person can keep writing sales/payments/
quotes/waste_log after every other part of "Offboarding" above says they
can't. This requirement, and the bridge itself, disappear entirely once the
db.ts cutover retires RTDB — see "Cutover plan" below, where verifying the
bridge is actually gone is a checklist item for exactly that reason.

## Closed signup — enforced by a trigger, NOT the dashboard toggle

`[auth] enable_signup` — both in `supabase/config.toml` and, on the
**hosted** project, at *Authentication → Providers → "Allow new users to
sign up"* — must stay **ON**. This was wrong in an earlier version of this
file, which said to turn it off; that locks out every sign-in, including an
allowlisted one, and was only caught because it locked out the owner's own
first sign-in (`signup_disabled` from Google's callback). GoTrue checks this
toggle before creating any `auth.users` row at all, for any provider,
*before* `reject_unlisted_signup` (below) ever runs — off doesn't narrow
who's allowed in, it blocks everyone.

`reject_unlisted_signup` (a database trigger — see
`20260829150000_allowed_users.sql`) is what actually enforces "signup is
closed against `allowed_users`," not that toggle. It's a `BEFORE INSERT`
trigger on `auth.users`, which fires after GoTrue's own gate has already let
the attempt through — see the comment on it for why it has to be `BEFORE`
specifically (that's what guarantees no orphaned `profiles` row for a
rejected email).

## Firebase Auth bridge — a live regression, fixed, temporary

**What broke.** After the auth port, nothing signs into Firebase Auth
anymore — the app signs into Supabase Auth only. But `sales`, `quotes`,
`payments` and `waste_log` still live on Firebase RTDB, and
`database.rules.json`'s rules for all of them gate on `auth != null` plus a
`root.child('users').child(auth.uid).child('role')` lookup, where `auth`
means a *Firebase* Auth session specifically. With no Firebase Auth session
ever established, every write to any of those paths — recording a sale,
taking a payment, voiding, touching a quote — failed `PERMISSION_DENIED`.
This was a real gap in the auth port that surfaced live, not a design
choice: reported in "What Firebase Auth provided that Supabase Auth does
not" below, that section only covered client-side conveniences and missed
that RTDB's own rules needed a Firebase session too.

**The fix.** `supabase/functions/mint-firebase-token` — an Edge Function
that, given a valid Supabase session, verifies it, looks up the caller's
role from `profiles`, mirrors that role into RTDB's `users/{uid}` node via
a plain authenticated REST call using the service account's own access
token (bypassing RTDB rules — the one privileged step; see the third-order
bug below for why this isn't the Admin SDK's `.set()`), and mints a
Firebase custom token for that same uid. `src/lib/firebase-bridge.ts`
calls it from `auth-context.tsx` whenever a Supabase session appears or
refreshes, then signs into Firebase Auth with the result — invisibly, no
second consent screen, no second sign-in the user sees. Because the custom
token's uid is set equal to the Supabase uid, `auth.uid` in RTDB rules now
matches `actor.uid` everywhere the app already writes it (e.g.
`sales/.../loggedByUid`), which a naive "just sign into Firebase again"
fix would not have — Firebase's own uid for the same Google account is a
different string. See the function's own comment for the full design and
the revocation caveat (also written into "Offboarding" above).

**Required manual step — nothing above works until this exists.** The
function needs the target Firebase project's service-account credentials,
as the `FIREBASE_SERVICE_ACCOUNT_JSON` secret. Generate this once yourself
— Firebase Console → Project Settings → Service Accounts → Generate new
private key — then set it directly as a secret, so the key itself never
passes through a chat or a shell that isn't yours:

```bash
# Local dev — supabase/functions/.env (gitignored, same pattern as
# supabase/.env for the Google OAuth credentials):
echo "FIREBASE_SERVICE_ACCOUNT_JSON='$(cat path/to/serviceAccountKey.json)'" \
  >> supabase/functions/.env

# Hosted:
supabase secrets set --project-ref <ref> \
  FIREBASE_SERVICE_ACCOUNT_JSON="$(cat path/to/serviceAccountKey.json)"
```

Restart (`npx supabase stop && npx supabase start`) after adding the local
`.env` file — same reason as the Google OAuth credentials: not picked up by
a running instance.

**This is temporary, on purpose.** It exists only because RTDB writes are
still live. Retire the Edge Function, `src/lib/firebase-bridge.ts`, the
`auth-context.tsx` calls into it, and RTDB's auth-gated rules together, at
the db.ts cutover (see "Cutover plan" below) — none of this has anything to
add once every write that needs it has moved to Postgres/RLS.

**Second-order bug the bridge itself exposed: live RTDB listeners lost the
race and never recovered.** `bridgeFirebaseAuth()` is fire-and-forget by
design — it must not block sign-in. But a component that calls `onValue`
unconditionally on mount (`settings-context.tsx` did; `dbService.subscribe`/
`subscribeQuery`/`subscribeToKeyRange` all did the same thing internally)
can attach its listener before the bridge finishes, get denied once, and —
this is the non-obvious part — **stay denied for the rest of the session**.
The RTDB JS SDK cancels a listener on `PERMISSION_DENIED`; it does not
retry it when auth changes later. Fixed by `whenFirebaseAuthed()` in
`src/lib/firebase.ts`: every RTDB subscription in `dbService`, and
`settings-context.tsx`'s own, now waits for a live Firebase Auth session
via `onAuthStateChanged` before attaching, and re-attaches if that session
drops and comes back (`.info/connected`, which needs no auth, is
deliberately NOT wrapped in this). One-shot reads/writes (`getRecord`,
`setRecord`, `createBatch`, …) never had this problem — a call that loses
the race just fails once and succeeds on the next attempt, same as before
the bridge existed.

**Third-order bug, found once the secret was actually set: `firebase-admin/database`'s
`.set()` hangs indefinitely in this runtime.** With `FIREBASE_SERVICE_ACCOUNT_JSON`
correctly configured, the function still never returned — no error, no
timeout, just an open connection until the client gave up. Isolated by
racing the call against a bounded timeout inside the function itself:
`getAuth(app).createCustomToken()` (same Admin SDK, same request, same
credential) returned in 4ms; `getDatabase(app).ref(...).set(...)` never
settled inside an 8s window. A plain outbound `fetch()` to the same
database's own REST endpoint, from the same runtime, answered in under a
second — ruling out the credential, the network, and the destination.
The `firebase-admin/database` submodule apparently depends on a connection
mechanism Supabase Edge Functions' Deno sandbox doesn't support. Fixed by
not using it: `writeRtdbRole()` in `mint-firebase-token/index.ts` mints a
Google OAuth2 access token directly from the service-account credential
(`credential.getAccessToken()` — local, no RTDB SDK involved) and does the
write as a plain authenticated `PUT` against RTDB's REST API instead — same
privilege, different transport. `firebase-admin/database` is no longer
imported by this function at all. If anything else in this codebase ever
needs `firebase-admin/database`'s live/streaming features (not just a
one-shot write), expect the same hang and use the same REST workaround.

## Known follow-ups — db.ts port

**Stock feasibility check before payment, not after.** `create_sale` bundles
an optional opening payment into the same transaction as the sale itself
(deliberate — see the migration `20260830160000_create_sale_and_record_payment.sql`:
splitting it into two calls would reopen the silent-loss window the whole
offline-queue design exists to close). The consequence: once real inventory
exists, a line that fails the stock check (`deduct_for_sale_line` raising —
not the zero-rolls skip from `20260830120000`, genuine insufficient stock)
rolls back the payment too, after the operator has already taken the
customer's cash. The fix belongs in the client, not the schema: before the
payment step is shown, check stock feasibility for the order's lines against
`inventory_rolls` (a plain read, no transaction needed) so a shortfall is
caught *before* money changes hands, not discovered when `create_sale`
fails. **Blocked until real inventory exists** — right now every
`inventory_rolls` row is empty for every material (see
`unconsumed_sale_lines`), so this check would either always pass trivially
or always warn falsely. Do this once the Sheets import has populated real
stock.

**Client resolution — a build item for the cutover slice, not just a flag.**
`create_sale`'s `p_client_id` has no producer yet. `sales-repository-pg.ts`'s
`createSale` (slice 5, tested but not wired — see below) takes `clientId` as
a plain required field, a real foreign key into `clients`. The Firebase
`createBatch` it replaces took `clientName`/`contact` as free text, no FK, no
lookup. **Work needed, in the cutover slice, before the New Sale screen can
call `createSale` for real:** find-or-create against `clients` from what the
screen has (a typed name) — look up by `clients.name_key` (the generated,
unique column from `20260829120200_tables.sql`:
`lower(regexp_replace(trim(name), '\s+', ' ', 'g'))`), and `insert ...
on conflict (name_key) do nothing` then re-select if no row matched, the
same landed-vs-replay shape `create_sale`/`record_payment` already use.
**Not a reuse of `src/services/client-identity.ts`'s `normalizeClientName`**
— that function strips all punctuation and whitespace entirely
(`blessing prints` → `blessingprints`), a different, stricter key than
`name_key` (`blessing prints` → `blessing prints`, whitespace collapsed but
kept). Keying against the wrong normalization would let the same customer
end up as two `clients` rows under Postgres's actual uniqueness rule. This
is separate from the Sheets import's client dedup (see the Cutover plan
below) — that job resolves *historical* spelling variants in bulk with a
frequency-vote heuristic (per the same migration's comment); this is a
single live lookup for one name typed at the counter, with no history to
vote across.

## Slice 5 — built and tested, not wired

As of `20260830170000_payment_batches_actor_name.sql`, the following exist
and are proven, but nothing in the app calls them yet — `createBatch`,
standalone `recordPayment`/`reversePayment`, and every screen still read
Firebase:

- **`create_sale` / `record_payment` RPCs** (migration
  `20260830160000_create_sale_and_record_payment.sql`, extended by
  `20260830170000` for `payment_batches.collected_by_name`) — proven live
  against a real local stack: first-write, replay (no duplication, including
  the case where an externally-written batch is missing its allocation —
  the "verify not assume" fix), genuine failures (bad FK, bad enum,
  insufficient stock rolling back an entire bundled sale+payment), reversal
  validation, and the deferred sum-check backstop rejecting a split-batch
  allocation at commit.
- **`src/services/sales-repository-pg.ts`** — read side from slice 4
  (`fetchSaleById`), plus `createSale`/`buildCreateSaleOp`/
  `journalEntryForSale` (write side, this pass). Unit-tested in
  `create-sale.test.ts` (dimension-unit conversion, adjustment mapping,
  opening-payment wiring, exact RPC argument names, journal clear-on-success
  and clear-on-failure) and live-verified via direct RPC/REST calls against
  the local stack for the RLS-authenticated path, replay safety, and
  `collected_by_name`/`receipt_number` round-tripping.
- **`src/services/payment-repository-pg.ts`** — `recordPayment`/
  `reversePayment`/`fetchPaymentsForSale`. Unit-tested in
  `payment-repository-pg.test.ts` (amount/reversal validation, exact RPC
  argument names, journal clear-on-success and clear-on-failure) and
  live-verified the same way as `sales-repository-pg.ts`.
- **`src/services/existence-check-pg.ts`** — the Postgres counterpart to
  `existence-check.ts`, for `reconcile()`'s cold-start path. Namespaces
  journal `path`s as `pg:<table>:<key>` (see `pgPath()`) so a single
  `ExistenceCheck` function can tell a Postgres-shaped entry apart from a
  Firebase one — needed because `outbox.ts`'s `OutboxOp` is currently a
  temporary union of both shapes (see the comment there). Unit-tested for
  the three-state contract (`true`/`false`/`null`) and live-verified via
  direct REST calls with the exact `.eq()` shape it uses. **Not yet wired
  into `reconcile-pending.ts`** — that file's `reconcile()` still calls only
  `dbService.existsOnServer`, correctly, because no screen constructs a
  Postgres-shaped journal entry yet. Wiring a dispatcher that picks between
  the two per entry is cutover-slice work (see below), once both shapes can
  genuinely appear in the same journal.
- **`src/services/outbox.ts` / `outbox-send.ts`** — temporary union of
  Firebase and Postgres op shapes; `sendOp` dispatches on `op.kind` to
  either `dbService` or `supabase.rpc`. Confirmed the live Firebase
  repositories still compile and pass their existing tests unchanged.

Two build items are now confirmed as belonging to the cutover slice, not
this one: standalone `recordPayment`/`reversePayment` need sales to exist in
Postgres first (already known); `createSale` needs the client-resolution
lookup against `clients.name_key` (new, above). Nothing else in this slice
has a hidden dependency of the same shape — `fetchSaleById`
and `fetchPaymentsForSale` are pure reads with no FK the app doesn't already
have, and the existence-check/journal/replay chain is backend-agnostic by
construction (`reconcile()`/`replayMissing()` take an injected check/send,
neither cares which backend answers).

## Hosted project setup

Everything built and tested this whole session has been against
`127.0.0.1:54321` — `npx supabase start`'s local instance. Nothing has ever
run against a real, hosted Supabase project. This is what that takes.

1. **Account-level — only the project owner can do this.** Create a
   Supabase organization/project at supabase.com (region, DB password).
   Note the project ref it gives you.
2. `supabase login` (authenticates the CLI), then from this repo:
   `supabase link --project-ref <ref>`.
3. `supabase db push` — replays every migration in this repo, in order,
   against the hosted project. This is the actual first deployment of the
   schema: enums, tables, RLS, triggers, views, the allowlist (including
   the `elijahfasugba@gmail.com` admin seed baked into
   `20260829150000_allowed_users.sql`), `create_sale`/`record_payment`,
   `sales.superseded_by_sale_id` — all of it, in the same order it applied
   locally.
4. **Redirect URL, hosted-specific.** Register
   `bomediasales://auth-callback` under Authentication → URL Configuration
   → Redirect URLs on the hosted project's Dashboard — `supabase/config.toml`'s
   `[auth]` block only governs local dev, it is not pushed. Without this,
   magic links sent from the hosted project won't complete (see "Sign-in
   methods" above). No OAuth client, no Google Cloud Console — that
   dependency is gone entirely now that Google sign-in has been removed.
   If real magic-link volume is expected, also configure custom SMTP
   (Authentication → Emails) — the built-in sender is rate-limited and
   meant for testing only (see "Sign-in methods").
5. **Auth settings, via the Dashboard — `supabase/config.toml` only
   governs local dev, it is not pushed to a hosted project.** Mirror
   `[auth]`'s settings by hand under Authentication → Providers / Settings:
   `jwt_expiry` (3600s, matching local), and — separately, deliberately
   called out below because getting this one backwards silently locks
   everyone out — **"Allow new users to sign up" must be ON.**

   **This is not the same lever as `allowed_users`, and turning it off does
   not harden anything — it disables sign-in for everyone, including the
   owner.** The mechanism, traced precisely, not asserted:

   A Google sign-in hits GoTrue's `/callback` endpoint first — an
   application server, not Postgres. GoTrue exchanges the code with Google,
   gets the verified email, and checks whether an identity for it already
   exists. For a first-time sign-in, GoTrue is about to create a new
   `auth.users` row — and **before it does, GoTrue's own application code
   checks this toggle.** If signups are disabled, GoTrue returns
   `signup_disabled` to the client right there, in its own Go code, **and
   never emits the `INSERT INTO auth.users` at all.**

   `reject_unlisted_signup` (`20260829150000_allowed_users.sql`) — the
   trigger that actually enforces the allowlist — is a Postgres
   `BEFORE INSERT` trigger. A trigger can only fire on an `INSERT`
   statement that reaches Postgres. With signups disabled, step above never
   sends one, so there is no insert for the trigger to intercept — it does
   not run, for anyone, allowlisted or not. This is not the trigger losing
   a race to the toggle; the toggle is enforced one layer up, before the
   database is consulted at all. `allowed_users` membership is irrelevant
   to a request that already failed before it got there.

   **This was observed live, not inferred:** with this setting off locally,
   the owner's own first sign-in — an allowlisted email, via Google — came
   back `signup_disabled` from Google's own callback, not from Postgres.
   Direct evidence the rejection happens before the trigger, not instead of
   letting it succeed.

   The allowlist trigger is the real enforcement. This toggle has to stay
   on for the trigger to ever get a chance to run at all.
6. `supabase functions deploy mint-firebase-token --project-ref <ref>`,
   then `supabase secrets set --project-ref <ref>
   FIREBASE_SERVICE_ACCOUNT_JSON=...` — the Firebase Auth bridge needs
   both on the hosted project, same as local (see "Firebase Auth bridge"
   above).
7. Seed the data-import account into the hosted `allowed_users` — not part
   of any migration, has to be a separate insert per environment (see
   `docs/sheets-import-brief.md`):
   ```sql
   insert into allowed_users (email, role) values ('data-import@bomedia-sales.internal', 'admin');
   ```
8. Point the app at the hosted project: swap `EXPO_PUBLIC_SUPABASE_URL`/
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` from the local values to
   the hosted ones — `.env.example` is already the template for this swap.
9. Run the real-device verification this repo already has a culture of
   (`docs/GATE_CHECKLIST.md`'s standard — real transactions, not static
   checks) against the hosted project specifically, not just local, before
   trusting it with anything real.

## Cutover plan (draft — not started)

Reads and writes move together in one release, not incrementally — see the
"hold everything until cutover" decision above. This is the plan for that
release. It is a plan, not code; nothing here has been built.

**Decided since this was first drafted: the import that precedes cutover is
the middle path, not a full historical import.** Wherever "the Sheets
import" appears below, it now means: `clients` (frequency-vote dedup,
unchanged) plus one permanent opening-balance sale per client carrying
their balance at freeze — not full line-item history. The freeze/verify
structure and the "no dual-read" reasoning below still hold, just over a
smaller computation. Full details, including why, in
[`docs/sheets-import-brief.md`](../docs/sheets-import-brief.md) — start
there. The full line-item backfill is deferred and no longer blocks
cutover; `sales.superseded_by_sale_id` (migrated already) is what lets it
attach real historical sales to a client without double-counting against
that client's opening-balance sale, whenever it eventually runs.

### Three systems, not two

The earlier draft of this plan assumed Firebase held a small amount of real
business history worth migrating. It does not: the Expo app has never been
deployed, so everything in Firebase is development/test data (this
session's own fixtures included). The real business runs on a **different,
currently-live system** — a Next.js app writing to Google Sheets, still
growing daily. Firebase is not part of the real migration lineage at all;
it is not backfilled, and nothing about its contents affects this plan.
It can stay as dev fixtures or be wiped — a local-only concern, not a
cutover concern.

That leaves three things, not two, to place in order:

1. **Sheets + the live Next.js app** — the current system of record for the
   real business, today.
2. **Firebase + the Expo app** — dev/test only, never deployed, no real
   data.
3. **The Sheets import job** — deferred, out of scope to design here (per
   the earlier decision that client dedup / historical import is a separate
   job), but its *position in the sequence* is exactly what this plan has
   to answer, because it decides what Postgres contains when the Expo app
   goes live. Its own open questions and known source-data facts are
   tracked separately in
   [`docs/sheets-import-brief.md`](../docs/sheets-import-brief.md) — start
   there, not here, when that job gets designed.

### Where the Sheets import sits: before cutover, not after

Two orders are possible. Only one is safe:

- **Sheets import BEFORE cutover (this plan's position).** Postgres is
  seeded with the real historical business data from Sheets while Sheets +
  Next.js is still the live system — the import is a read from Sheets, not
  a cutover of anything yet. Once verified, freeze Sheets/Next.js input, run
  a final delta pass to pick up whatever was written since the initial
  import (Sheets keeps growing daily, so the first pass will always be
  stale by the time it's verified — the import has to run again, or
  incrementally, against Sheets' state *at the freeze moment*, not an
  earlier snapshot), verify that, then ship the Expo release pointed at a
  Postgres that already holds the real business's history. One system of
  record at every point after go-live.
- **Expo/Postgres live now, Sheets import later (rejected).** The Expo app
  would go live holding only backfilled dev/test data — no real client
  balances, no real sale history — while the actual business keeps running
  on Sheets in parallel. Two consequences, both bad: the business runs for
  some stretch in a system (Expo) that doesn't have its own history, which
  defeats the point of switching; and the deferred Sheets import — already
  scoped as its own job — inherits a harder problem than the one it was
  designed for. Importing into a quiescent, pre-launch Postgres is a batch
  load with no collisions to avoid. Importing into a Postgres that already
  has live Expo `sales`/`clients`/`payment_batches` rows means reconciling
  historical Sheets rows against real, already-referenced data —
  `receipt_number` collisions, `clients.name_key` collisions between a
  Sheets customer and one the live app already created via the
  find-or-create lookup above, and no way to tell, from the RPCs alone,
  whether a given period's Sheets rows predate or overlap the live rows
  already sitting there. This plan does not choose that path.

**What Postgres contains, stage by stage:**

| Stage | Postgres contents | System of record |
|---|---|---|
| Now | Dev/test fixtures only (this session's, and any local testing) | Sheets + Next.js |
| Sheets import runs (before freeze) | + real historical business data, imported and being verified | Sheets + Next.js (still live) |
| Freeze + delta import | + whatever Sheets gained since the initial import | Sheets + Next.js (frozen) |
| Expo release ships, freeze lifts | Full real history + new live writes from Expo | Expo + Postgres |
| Post-cutover | Live, growing normally | Expo + Postgres. Sheets/Next.js retired, read-only |

**Prerequisites (must land before this release, not during it):**

1. Client resolution — find-or-create against `clients.name_key` from what
   the New Sale screen has (a typed name). See "Client resolution" above.
   This is the live, single-lookup mechanism `createSale` needs going
   forward; it is separate from the Sheets import's own (bulk,
   frequency-vote) client dedup, item 2 below.
2. The Sheets import itself — out of scope to design here, but its
   ordering requirement is in scope: it must run, be verified, and be
   re-run as a delta against Sheets' frozen state, entirely **before**
   step 3 below. See "Where the Sheets import sits," and
   [`docs/sheets-import-brief.md`](../docs/sheets-import-brief.md) for its
   own open questions.
3. Import verification, before anything user-facing changes: row counts
   match Sheets', billed/paid sums reconcile against whatever Sheets treats
   as authoritative, and a spot-checked sample matches field-for-field.
   This is the gate — the release does not ship until this passes.
4. The force-quit-on-a-real-device test already agreed as required after
   cutover (not skippable) — plan for it here, run it as part of this
   release's own verification, same rigor as `docs/GATE_CHECKLIST.md`'s
   existing "real transactions, not static checks" standard.

**Order of switching, within the release:**

1. Sheets import runs against Sheets' live state (prerequisite 2).
2. Verify it (prerequisite 3).
3. Freeze input to the live Next.js/Sheets system for the cutover window
   (pick a low-traffic moment).
4. Run the delta import to catch anything written since step 1.
5. Verify the delta.
6. **Ship the release.** This is a build step, not a swap — slice 4/5 proved
   the pattern (one read, one write, replay-safe), not parity. Diffing every
   export of `sales-repository.ts`/`payment-repository.ts` (Firebase)
   against their `-pg` counterparts, nine functions their real callers
   depend on do not exist yet:

   | Missing | Caller | Shape |
   |---|---|---|
   | List-fetch replacing `subscribeToBatches` | `records.tsx`/`.web.tsx`, `board.tsx`, `use-records.ts` | Realtime is out of scope (standing decision) — one-shot fetch, pull-to-refresh/refetch-on-focus, same pattern as activity/expenses. |
   | `fetchBatchesByReceiptIds` | `invoice.tsx` | Multi-receipt invoice read. |
   | `updateProductionStage` | `board.tsx` (drag-drop) | Thin single-row update — the job-status transition trigger already permits it. |
   | `updateBatchDetails` | `invoice.tsx` (notes/due-date) | Thin single-row update. |
   | `voidBatch` | `transaction/[id].tsx` | Thin update — `sales_void_returns_stock` trigger already handles the inventory side. |
   | `markBatchesPaid` | bulk mark-paid (confirm still wired to a screen) | **Not thin. Build a dedicated bulk RPC, one transaction across every selected sale — decided, not deferred.** Firebase's version is one atomic multi-path update; looping client-side calls to `record_payment` gives up that atomicity, and a partial result (some sales marked paid, some not, no record of which one failed or why) is exactly the failure class this whole port exists to prevent — same reasoning as bundling `create_sale`'s opening payment rather than splitting it into two calls. Not designed here (still "don't start"), but its atomicity requirement is settled: whole-batch success or whole-batch rollback, no partial-success-with-reporting. |
   | One-shot replacing `subscribeToPaymentsForDay` | `cash.tsx` | Same realtime-to-one-shot conversion. |
   | One-shot replacing `subscribeToPaymentsInRange` | `ledger-integrity-banner.tsx` | Same. |
   | `recalculateTotalPaid` | — | Likely **obsolete, not missing** — `sale_totals`/`client_debt` compute this live from SQL. Confirm before porting it, don't port it by default. |

   Also in this step: **client resolution**, decided as resolve-at-submit
   (not search-as-you-type) — the dedup pressure search-as-you-type would
   add is weaker now that `clients` gets seeded from the Sheets frequency
   vote before cutover (see `docs/sheets-import-brief.md`), so the
   near-duplicates that matter already exist by the time anyone types a
   name at the counter. Revisit only if staff start creating variants in
   practice. Look up by `clients.name_key`'s own normalization (not
   `client-identity.ts`'s `normalizeClientName` — a different, incompatible
   scheme), `insert ... on conflict (name_key) do nothing`, re-select on
   conflict, same landed-vs-replay shape as `create_sale`/`record_payment`.

   Also: `quote-repository.ts` imports `createBatch`/`generateReceiptId`
   from the Firebase `sales-repository.ts` for its quote→sale conversion.
   Quotes themselves stay on Firebase permanently (standing decision), but
   converting a quote into a real sale should create that sale wherever
   sales now live — this needs repointing to `createSale` too, even though
   nothing else about quotes changes.

   Once the above exist: swap every read call site from `sales-repository.ts`
   to `sales-repository-pg.ts`; swap `createBatch`/standalone
   `recordPayment`/`reversePayment` call sites to the `-pg` equivalents;
   collapse `OutboxOp` to the Postgres-only variants (drop `'update'`/`'set'`,
   drop `IncrementMarker`/`encodeIncrement`, per the comment already left in
   `outbox.ts` marking this as temporary); wire the existence-check
   dispatcher in `reconcile-pending.ts` to `checkExistsOnServerPg`; update
   any `.dbPath`-keyed call site to use `.id` (flagged since slice 4's
   `normalizeSale`).
7. **Verify the Firebase Auth bridge is GONE, as a checklist item, not an
   assumption.** Once every RTDB-dependent write/read above is off Firebase,
   the bridge has nothing left to bridge. Confirm all of: `mint-firebase-token`
   (the Edge Function) deleted; `src/lib/firebase-bridge.ts` deleted; the
   `bridgeFirebaseAuth`/`unbridgeFirebaseAuth` calls removed from
   `auth-context.tsx`; `whenFirebaseAuthed` and the Firebase `auth` export
   removed from `src/lib/firebase.ts` (or `firebase.ts` removed entirely, if
   nothing else in it survives); `database.rules.json` retired along with
   whatever still deploys it; the `FIREBASE_SERVICE_ACCOUNT_JSON` secret
   revoked/deleted, not just left set. Leaving any of this in place "just in
   case" keeps the unbounded revocation gap documented in "Offboarding"
   above alive for no reason — the bridge exists only because RTDB writes
   are live, and once they aren't, half-removing it is strictly worse than
   fully removing it.
8. Unfreeze onto Expo. The app now reads and writes Postgres exclusively;
   Next.js/Sheets becomes read-only history, kept for audit, not written to
   again. Firebase was never part of this lineage and needs no disposition.

No dual-read window. A dual-read layer (query both, merge in the client)
doubles the surface for exactly the failure class this whole migration
exists to close — two sources of truth for money, silently able to diverge
(the same shape of problem `docs/AUDIT_2026-07.md`'s "offline writes are
lost silently" finding was about, just at the read side instead of the
write side) — and here it would mean two *live, real* systems disagreeing,
not a read-only reconciliation. Import once (plus one delta), verify it,
cut over.

**Rollback if something fails mid-way.** Two different moments, two
different answers:

- **Before the write freeze is lifted** (Sheets import or its verification
  fails, at either pass): cheap. Nothing user-facing has changed and Sheets/
  Next.js is untouched — delete the partial Postgres import rows, fix the
  script, rerun. This is also where most of the real risk in this plan
  actually lives, precisely because it's the one place mistakes are cheap;
  take the time here rather than rushing to the freeze.
- **After the release ships and the freeze lifts** (a defect surfaces once
  real writes are landing in Postgres): **do not plan to revert the app
  release.** A revert to Sheets/Next.js after Postgres writes have started
  strands exactly the sales this whole "hold everything" decision was
  designed to prevent — a Postgres-only sale the old system was never told
  about. The only way to make a revert safe is a reverse-migration
  (Postgres-since-cutover back into Sheets) run before or during the
  revert, which is real work under real time pressure, not a safety net.
  The actual answer is the same one this codebase already uses everywhere
  else money is involved: **verify before it ships, patch forward if
  something is found after.** A defect caught post-release gets a forward
  fix and a new release, same as any other bug — not a revert. The one
  exception: a release so broken it fails to boot for anyone, caught within
  minutes and provably before any write reached Postgres (checkable —
  query `sales`/`payment_batches` for rows created after the release
  timestamp) — that specific case can revert safely, because nothing was
  stranded. Anything past that point is forward-only.

## What Firebase Auth provided that Supabase Auth does not

Ported for parity with the Firebase version this replaces, or worth knowing
about if something feels missing. **This list was wrong by omission when
first written** — it covered client-side conveniences only, and missed that
Firebase RTDB's own security rules require a live Firebase Auth session,
independent of anything Supabase-side. That gap broke every RTDB write live
before it was caught; see "Firebase Auth bridge" above for what it was and
the fix.

- **A synchronous "who's signed in right now" accessor.** Firebase's
  `auth.currentUser` is available synchronously, reflecting the SDK's cached
  state. Supabase's equivalent, `getSession()`, is async — this app works
  around it by mirroring the latest session into a ref as
  `onAuthStateChange` delivers it (see `sessionRef` in
  `src/context/auth-context.tsx`).
- **Per-call, runtime-switchable persistence.** Firebase's
  `setPersistence()` could be called right before sign-in to choose
  local-vs-session storage on an already-created auth instance. Supabase
  fixes its storage adapter at `createClient()` time — `src/lib/auth.ts`
  works around this for web with a storage adapter that reads a
  module-level flag on every call, re-seeded from `localStorage` on load
  (see the comment there for why the seeding has to be synchronous).
- **A stable JS `User` object shape.** Firebase's `User` has `.uid`,
  `.displayName`, `.photoURL`, etc. as first-class fields. Supabase's `User`
  has `.id` and pushes provider-supplied profile data into
  `user_metadata` (an untyped bag whose keys depend on the provider — Google
  happens to send `full_name`/`name`). `toAppUser()` in
  `src/context/auth-context.tsx` is the adapter that keeps the rest of the
  app on the old field names.
