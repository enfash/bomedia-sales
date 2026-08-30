# Sheets → Postgres import brief

**Decided: the middle path, not a full historical import, blocks cutover.**
Firebase dev data is fully discardable (confirmed) and Sheets/Next.js is the
only real system of record, but importing full line-item history before
cutover was rejected as the wrong trade — see `supabase/README.md` →
"Cutover plan" for the comparison (what breaks per-screen without an import,
what gets harder importing against a live database, and why the middle path
wins). What actually precedes cutover now is much smaller: `clients` (via
the frequency-vote dedup, unchanged from the full-import plan) plus one
permanent **opening-balance sale per client**, carrying whatever they owed
at the freeze moment — not their itemized history. The full line-item
backfill is deferred, not blocking, and doesn't need to happen under time
pressure.

**Decided: overpaid clients are clamped to zero, not modeled as credit.**
If a client's computed balance at freeze is negative, no opening-balance
sale is created for them — they come out of the computation as a separate
list (client, credit amount) for manual settlement. No credit mechanism
gets invented in the schema for what's expected to be a handful of rows.

**Decided: imported rows attribute to a dedicated account, not a real
person's.** `sales.logged_by`/`payment_batches.collected_by` need a real
`auth.users` row regardless of what wrote the row — using the owner's own
account would make "who created this" unable to distinguish an import from
a human entry, permanently, in a financial record. Seeded into
`allowed_users` as admin (local dev; needs the same insert against any
hosted project before that import runs there too):

```sql
insert into allowed_users (email, role) values ('data-import@bomedia-sales.internal', 'admin');
```

`.internal` because this address must never be signed into — it isn't
meant to resolve or receive mail, only to exist as an allowlist/`auth.users`
row. **Not yet provisioned as a real `auth.users` row** — `allowed_users`
alone doesn't create one (that only happens via GoTrue's own signup flow or
the Admin API); this needs `supabase auth admin create-user` (or the
hosted-project equivalent) run once, immediately before the import actually
uses this account, not before.

**Already migrated, ahead of need:** `sales.superseded_by_sale_id` and the
`client_debt` amendment that excludes a superseded sale from both its billed
and paid sums (`20260830180000_sales_superseded_by.sql`) — what lets the
opening-balance sale stay permanent, never voided or rewritten, once the
full backfill eventually attaches real historical sales to the same client.
Live-verified: marking a sale superseded removes exactly its own billed and
paid amounts from `client_debt`, nothing else; a self-referencing
`superseded_by_sale_id` is rejected by its own CHECK constraint.

**Still open, and stated explicitly as the owner's to answer, not
assumed:** how long the Sheets freeze can last, before this gets designed
further — question 1 below, now scoped to the smaller opening-balance
computation rather than full reconstruction, which should make it easier to
answer, not harder.

This document is the open questions and known facts for whatever gets
designed next — the opening-balance import now, the full backfill later —
written down so a session picking this up starts from these instead of
re-deriving them. **Questions and facts only — neither import is designed
here.**

## Three questions to answer before designing the import

1. **How long can the Sheets freeze last?** Between freezing writes and the
   Expo release going live, the business cannot record a sale. A couple of
   hours means a single import on a Sunday. Longer means a delta pass at
   cutover instead. This decides the import's shape.

2. **What does "verified" mean, as concrete SQL?** Not "rows loaded."
   Define the queries that must match across both systems before cutover:
   - total billed, all time
   - total collected, all time
   - outstanding balance per client
   - every payment batch's allocations summing to its `BATCH TOTAL`

   Write these as actual queries against the Postgres schema, plus the
   equivalent Sheets aggregation to diff against.

3. **What happens to rows that will not import cleanly?** Options: clean in
   Sheets first, transform during import, or land in a quarantine table for
   manual review. Silently dropping them makes the verification totals
   wrong.

## Known source-data facts (from the live Sheets system)

- Roughly 4,500 sales rows and 900 payment rows, growing ~100 sales/week.
- Sales tab has 27 columns. Dimensions live in an 8-slot layout
  (3FT..10FT, custom) where the computed sqft goes in whichever slot
  matches the roll width; the others are blank. Maps to
  `width_ft`/`height_ft`/`job_unit`.
- `TRANSACTION ID` groups line items into one order; `SALES ID` identifies
  a single line. Maps to `sales` → `sale_lines`.
- `PAYMENT STATUS` and `AMOUNT DIFFERENCES` are sheet formulas, not truth.
  Do not import them — status is derived by `computePaymentStatus`.
- Client is free text, with duplicates differing by case and trailing
  whitespace ("Ola" vs "Ola "). The one-time frequency-vote dedup from the
  old app's `lib/client-names.ts` belongs here, before seeding `clients`.
- Payments now carry `BATCH ID` and `BATCH TOTAL` (added to the live
  Next.js app this session). Rows before that fix have no batch grouping
  and need reconstruction by client + collector + timestamp clustering;
  mark those as reconstructed, not recorded.
- Payment rows may carry a `Rounding` kind alongside `Settlement`.
- Known dirty rows: a "Test" client, a "TEST WIDTH QA CUSTOM" row, payment
  rows with `BALANCE BEFORE 0 / BALANCE AFTER 0`, negative
  `AMOUNT DIFFERENCES` from rounding overpayments.
- Sheets tabs with no app equivalent and no import need: Assets, Capital
  Injections, Budget & P&L, the fixed-cost sheet, supplier price
  comparison.

## Related work already identified

Two build items for the cutover slice, not the import itself, but adjacent
to it — see `supabase/README.md` → "Known follow-ups — db.ts port" and
"Slice 5 — built and tested, not wired":

- Client find-or-create against `clients.name_key`, for the live New Sale
  screen going forward (distinct from this import's own bulk,
  frequency-vote client dedup above).
- The standalone `recordPayment`/`reversePayment` rewrite, blocked on sales
  existing in Postgres.
