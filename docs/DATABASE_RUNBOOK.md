# Database runbook

> **The legacy migration described in earlier revisions of this file no longer
> exists.** On 2026-08-01 the whole sales tree was found to be test data and the
> database was wiped and restarted clean instead of migrated. `adaptLegacyRecords`,
> `deriveLegacyMoneyFields` and `scripts/migrate-sales.ts` were deleted with it.
> What remains here is the operational knowledge worth keeping: how to get write
> access at root depth, how to verify a clean database from its first real sale,
> and what Stage 2 still owes.
>
> The incident that led to the wipe is recorded in
> [`INCIDENT_2026-08-01-data-loss.md`](INCIDENT_2026-08-01-data-loss.md).

## Wipe of 2026-08-01 — what happened

The entire transactional database was deleted and restarted clean.

| Node | Records | Value |
|---|---:|---:|
| `sales` | 14 | ₦1,002,689 |
| `quotes` | 2 | ₦31,140 |
| `activity` | 16 | — |
| `expenses` | 2 | ₦13,005,000 |
| **Total** | **34** | **₦14,038,829** |

`users` (one admin account) and `settings` (11 materials, 1 printer, business
profile, metrics) were protected and verified intact afterwards by two
independent reads.

All of it was test data. The ₦13m "Machinery" expense and the ₦10.8m `new` sale
were the two largest entries and both were fabricated, which is why every
dashboard figure before this date was meaningless.

---

## Write access at root depth — read this before any bulk operation

**Only the Firebase Admin SDK can write at the top of `sales` / `quotes` /
`activity` / `expenses`.** This is not a misconfiguration; it is the rules
working as intended, and it will stop the next bulk script exactly as it stopped
the first one.

In `database.rules.json`:

- root is `".write": false`
- `sales` grants `.read` to any signed-in user, but its only `.write` rule sits
  at `sales/$y/$m/$d/$id`
- so there is **no path** by which a signed-in user — admin included — can
  delete or replace a whole node

A client-SDK script therefore fails with a bare `Permission denied` at the first
read, which looks like a credentials problem and is not.

### What a future bulk operation needs

1. Firebase console → **Project settings → Service accounts → Generate new
   private key** (Node.js).
2. Save it as `secrets/bomedia-service-account.json`. The `secrets/` directory
   and `*-service-account*.json` / `firebase-adminsdk-*.json` are already in
   `.gitignore` — verify with `git check-ignore -v` before going further.
3. `npm install --save-dev firebase-admin tsx` — **both were removed after the
   wipe** and must be re-added.
4. `export GOOGLE_APPLICATION_CREDENTIALS=./secrets/bomedia-service-account.json`
   (this does not survive a new terminal tab).
5. Delete the key and revoke it in the console when done.

> The key bypasses every rule. Treat it as full unrestricted database access,
> because that is what it is. Do **not** loosen `database.rules.json` to let a
> one-off script through — that weakens the app permanently to save a temporary
> inconvenience.

### The worked example

`scripts/wipe-test-data.ts` was deleted after the wipe — it could not typecheck
once `firebase-admin` was removed, and uncompilable code in the tree breaks CI
for everyone. Recover it from git when you need a starting point:

```bash
git show 4c74502602338d805062f05d8873f5b429ea8632opying:

- an **allow-list** of nodes the script may touch, and a **protected list**
  (`users`, `settings`) checked twice — once when building the target list, once
  immediately before the destructive call
- targets **hardcoded**, not taken from argv, so no flag can redirect it
- **dry run by default**; `--commit` is opt-in, and anything unusually
  destructive gets its own flag on top (`--include-expenses`)
- print **every record** it will touch with counts and monetary totals, so the
  figures can be checked against an independent survey first
- after committing, **read back** every node it wrote or deleted, confirm the
  protected nodes survived, and exit non-zero on any mismatch

---

## Rebuilding `paymentRefs`

The transaction screen reads a sale's payments **through**
`sales/…/{saleId}/paymentRefs`. If those refs are missing, the screen shows no
payments against a sale that plainly has a `totalPaid` — silent, and usually
noticed by a customer first.

Two situations produce that:

- **A restore.** Sales recovered from an export predating the refs come back
  with `totalPaid` set and no refs.
- **A deleted ref.** An admin can remove one and the rules cannot prevent it
  (see AUDIT_2026-07.md). The ledger is unaffected — only the index is lost.

The mapping is already written and tested:
`src/services/migrations/payment-refs-backfill.ts`. It is pure, so it needs a
thin Admin SDK runner — same pattern as the wipe script, and it needs
`firebase-admin` and `tsx` re-added first (see §"Write access at root depth"):

```ts
// scripts/backfill-payment-refs.ts
import { planPaymentRefBackfill, isBackfillComplete } from '../src/services/migrations/payment-refs-backfill';
// …initialise the Admin SDK exactly as the wipe script did…
const payments = (await db.ref('payments').get()).val();
const sales    = (await db.ref('sales').get()).val();
const plan = planPaymentRefBackfill(payments, sales);

console.log(`${plan.ledgerEntryCount} entries · ${Object.keys(plan.updates).length} refs to write`);
console.log(`${plan.alreadyCorrect} already correct · ${plan.conflicts.length} conflicts · ${plan.orphans.length} orphans`);
if (!process.argv.includes('--commit')) process.exit(0);   // dry run by default
await db.ref().update(plan.updates);                        // one atomic update
```

**Read the conflicts and orphans before committing.** A conflict means a ref was
written by hand and points elsewhere; the plan never overwrites one. An orphan
means a payment references a sale that no longer exists — money recorded against
nothing, which needs a person, not a script.

Safe to re-run: a second pass produces an empty plan, which is covered by a test.

---

## Bulk deletions go through a script, not the console

The 2026-08-01 incident happened because eight records were deleted by hand in
the console when four were intended, with no export taken. The console is fine
for one field on one node. For anything else:

- take a **full export first** — see below
- use a script that takes an explicit list of keys, prints what it will delete
  with counts and totals, and requires a second run to commit
- verify by re-reading afterwards

---

## Exports

Take one before **any** destructive or structural change, and a second after a
correction but before a migration — they protect different mistakes. A backup's
job is to let you reach any earlier state, not to represent the state you
intended.

```bash
firebase login
firebase database:get / --project bomedia-official \
  --output ~/backups/bomedia-rtdb-$(date +%F)-pre-<what>.json
```

Console route: **Realtime Database → ⋮ → Export JSON**.

Confirm it is real before proceeding — `ls -lh` (not 0 bytes) and `head -c 200`.

---

## First real sale — verify the clean database

This replaces the two named post-migration checks (`old school` / `New ade`),
which no longer exist. It is also the end-to-end verification Stage 1 never got:
every fix in that stage is exercised here against real data.

### Setup

Enter one deliberate small job priced **below the ₦1,000 MOV** — e.g. 2ft × 3ft
(6 sqft) at ₦100/sqft = ₦600. No delivery.

### On the batch review card, before submitting

- [ ] Items Subtotal reads **₦600** — the goods alone, not ₦1,000
- [ ] A row reads **"Minimum order adjustment +₦400"**
- [ ] Order total reads **₦1,000**
- [ ] Adding a second ₦600 line makes the subtotal ₦1,200 and the MOV row
      **disappear** — the minimum applies once to the order, not per line

### On the transaction detail screen

- [ ] Subtotal **₦600**, adjustment row **+₦400**, grand total **₦1,000**
- [ ] Subtotal is not silently ₦1,000 — that was the bug at `transaction/[id].tsx:149`

### On the invoice — both renderers

- [ ] The on-screen view shows Subtotal / Minimum order adjustment / Total
- [ ] **Export the PDF and compare.** They are separate renderers sharing one
      totals object; this is the first real test that they agree

### Delivery does not absorb the minimum

- [ ] A ₦600 job with ₦2,000 delivery totals **₦3,000**, not ₦2,600

### Dashboard with exactly one sale

- [ ] Today's Sales = 1, Revenue = ₦1,000
- [ ] If you can, enter a sale **after midnight WAT** — it must still count as
      today. That is the UTC-boundary fix, and it is only observable then
- [ ] Outstanding ₦1,000 while unpaid → ₦0 and status **Paid** once recorded

### Status colours

- [ ] Set a due date in the past. The chip must be deep red and **filled**,
      visibly different from Unpaid's outlined red
- [ ] Change Default Payment Terms in Settings and confirm a sale with no due
      date changes status accordingly

### Money never shows kobo

- [ ] No figure anywhere renders a decimal — line items, subtotals, invoice, PDF
- [ ] Dashboard tiles may abbreviate (`₦1.2M`); tables and invoices must not

---

## Stage 2 gate — deploy the rules, then six real-payment checks

### 1. Deploy the payment rules — ✅ DONE 2026-08-01

Released to `bomedia-official-default-rtdb`. The ledger is now enforced: entries
are create-only for everyone including admin, `byUid` must match both `auth.uid`
and the path segment, a negative amount is rejected unless it carries
`reversalOf` and a non-empty `reversalReason`, and reversals are admin-only.

The stored CLI token had expired and needed `firebase login --reauth` (a browser
flow) before `firebase deploy --only database` would run. Expect that again next
time — the token expires on its own schedule, and the 401 it produces reads like
a project-permissions error rather than an expiry.

```bash
firebase login --reauth      # the stored token expires; this opens a browser
firebase deploy --only database
```

`firebase-tools` prints a `url.parse()` DeprecationWarning mid-deploy. It comes
from the CLI's own `getDatabaseUrl`, not from this project's config, and the
deploy succeeds regardless.

The change is **purely additive** — verified by parsing both versions and
diffing: `payments` added, no existing node semantically changed (the rest of
the diff is reformatting). So it cannot lock anyone out of what already works.

Console alternative if the CLI stays unhappy: **Realtime Database → Rules**,
paste `database.rules.json`, Publish.

Confirm it took: as a staff (non-admin) account, reading another user's bucket
must fail. The rule that matters is `payments/$day/$uid/.read`.

### 2. The six real-payment checks

Run these against the clean database, in order. Each has an expected value —
if one differs, stop rather than carrying on.

| # | Check | Expect |
|---|---|---|
| 1 | **Partial payment.** ₦10,000 sale, record ₦4,000 Cash | Balance ₦6,000, status **Partial**. History shows one entry: `Cash · +₦4,000 · your name` |
| 2 | **Second payment, same invoice.** Record ₦6,000 POS on the same sale | Balance **₦0**, status **Paid**. History shows **two** entries, newest first. This is the concurrency fix: under the old read-modify-write the second write could erase the first |
| 3 | **Bulk mark-paid.** Select two unpaid sales in Records → Mark as paid | A method prompt appears — Cash / POS / Transfer. It must **not** proceed without one. Each sale gets its own entry noted "Marked paid in bulk from Records" |
| 4 | **Advance on a new sale.** New Sale, ₦20,000 total, ₦5,000 advance in Cash | See below — this is the one to watch |
| 5 | **Cash view matches the drawer.** Open Daily Cash for today | "Cash that should be in the drawer" equals the physical cash from checks 1–4. POS and Transfer are excluded — they are in the bank, not the drawer |
| 6 | **Admin reversal.** Reverse one payment, with a reason | Cash view shows **collected**, **reversed** and **net** as three separate figures. A day that took ₦50,000 and reversed ₦50,000 must not read like a quiet day |

### Check 4 in detail — the bug that would have shorted the drawer daily

`createBatch` used to write the advance straight into `totalPaid` with no ledger
entry. Every deposit taken at the counter was invisible to reconciliation, and
deposits are the most common cash of all — so the drawer would have been over
by every advance taken, every single day, with nothing to explain it.

After recording a ₦5,000 advance on a ₦20,000 sale:

- the sale shows **₦15,000 outstanding**, status **Partial**
- its payment history shows **one entry**: `Cash · +₦5,000`, noted
  **"Advance taken at sale"**
- **Daily Cash includes that ₦5,000** in today's collected and in
  "should be in the drawer"

The third bullet is the actual test. The first two would have passed before the
fix as well.

---

## Stage 2 — payments become append-only

**The payment migration is gone.** With an empty database there is no historic
`totalPaid` to fold into synthetic opening entries, so Stage 2 is now purely
forward-looking:

- `recordPayment` writes append-only payment child records
- `totalPaid` becomes a transaction / `increment` rather than a read-modify-write
- **money policy rule 4 still applies** — payment amounts round to whole naira at
  write, using the same `money.ts` helpers as line totals. `roundNaira` is
  already exported and tested.

### What was removed from this section

- the migration script and its backfill obligation
- the mandatory pre-`--commit` export **for the migration** — there is no
  migration. Still take an export before any schema change once real sales exist
- the two named checks (`old school` ₦107,300 and `New ade` ₦80,160 reading
  Paid). Those records were deleted in the 2026-08-01 incident and no longer
  exist. The first-real-sale checklist above replaces them.

### Why rule 4 still matters

`totalPaid` becomes a sum over payment children. Unrounded amounts drift, so
`totalBalance` never reaches exactly zero on a fully-paid invoice — and that
breaks the Paid status derivation, because `computePaymentStatus` tests
`totalPaid >= totalAmount`. A few kobo of float is the difference between an
invoice reading Paid and reading Partial forever.
