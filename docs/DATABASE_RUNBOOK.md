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

`scripts/wipe-test-data.ts` is the worked example: allow-list of touchable
nodes, `users` and `settings` protected by two guards, dry run by default, and
read-back verification after committing.

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
