# Sheets → Postgres import brief

**Decided: opening balances are entered manually, not scripted.** No import
job runs before cutover at all. The owner reads each client's outstanding
balance off the Sheet and enters it by hand — through whatever the app or
Supabase Studio offers for creating a sale, once the cutover slice exists.
This replaces the "middle-path import" plan below with something smaller;
the reasoning that led here (why *some* pre-cutover balance step is needed
at all, and why full line-item history isn't) still holds — see
`supabase/README.md` → "Cutover plan" for that comparison — only the
mechanism changed, from a script to manual entry.

Two things carry over unchanged from the scripted version of this plan:

1. **Client dedup still runs first, and it's still a real (small) import,
   not manual.** Seed `clients` from the Sheets data using the
   frequency-vote spelling — *before* cutover, before anyone types a name
   at the counter. `clients.name_key` is unique and first-insert-wins is
   permanent (see `20260829120200_tables.sql`'s own comment on that column)
   — whichever spelling exists first is what every later sale matches
   against, forever. This is the one piece of "the import" that still has
   to be a deliberate, ordered step, not something manual entry can
   substitute for.
2. **Opening-balance sales still use `sales.superseded_by_sale_id`'s
   design** (migrated in `20260830180000_sales_superseded_by.sql`) — a
   manually-entered opening-balance sale is exactly as permanent as a
   scripted one would have been, and the deferred full line-item backfill
   still needs the same "attach real history without double-counting"
   mechanism whenever it eventually runs. Manual entry doesn't change what
   gets built into a sale, only who/what creates the row.

**Decided: verification is one number, not a query suite.** After balances
are entered, compare the app's total outstanding (sum of `client_debt` across
all clients) against the Sheet's own total outstanding. One comparison, not
the four-query suite question 2 below originally called for — that fuller
suite (total billed, total collected, per-client balance, batch-allocation
sums) still matters for the *deferred full backfill*, which is scripted and
needs that level of proof; manual entry of a single number per client
doesn't have the same failure surface a script does, so it doesn't need the
same verification weight.

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

**Resolved by going manual, not answered directly:** the original freeze-
duration question ("how long can Sheets writes be paused for a batch job")
mostly stops applying — there's no batch job with a runtime to bound.
Manual entry still needs a moment where each client's balance is read as
"true as of now," and there's still a gap between that moment and the
cutover slice actually going live during which a new Sheets/Next.js sale
could change that client's real balance before Postgres has it — but that's
a much smaller, more forgiving timing question than the original one, and
still the owner's to answer operationally (re-check a balance that moved,
or accept the small drift and true it up at the one-number verification
step) rather than something to design around in code.

This document is the open facts and remaining decisions for what's left —
client dedup, and whatever the deferred full backfill eventually needs —
written down so a session picking this up starts from these instead of
re-deriving them. **Facts and open items only — neither the dedup step nor
the eventual full backfill is designed here.**

## What's left to decide

1. **Client dedup — needs an owner, a run, and a check, even though it's
   small.** Who runs the frequency-vote pass (a one-off script reading
   Sheets, writing `clients`), and when relative to the cutover slice
   landing — it has to be before anyone can create a live sale through the
   app, since the very first counter-typed name after cutover starts
   claiming spellings otherwise. Not designed here; flagged so it isn't
   forgotten now that it's the only real "import" left.

2. **The one-number verification, made concrete.** "App's total outstanding
   vs. the Sheet's total outstanding" needs an actual query on the Postgres
   side once `client_debt` has real rows in it — `select sum(balance) from
   client_debt` is the shape, but confirm it against the real view once
   opening balances exist, not assumed now.

3. **What happens to a client on the Sheet with no clean name to dedupe**
   (a "Test" client, a malformed row) **when it's time to enter their
   balance.** Smaller version of the old question 3 — still worth a decided
   answer (skip, clean by hand first, flag for review) before manual entry
   starts, so it isn't decided ad hoc per row.

## Known source-data facts (from the live Sheets system)

Kept for whoever runs client dedup and, later, the deferred full backfill —
most of these (dimensions, `TRANSACTION ID`, batch reconstruction) only
matter to that later, still-scripted backfill now that opening balances are
manual. The client-identity bullet matters now.

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
