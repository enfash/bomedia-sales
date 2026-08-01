## Stage 1 — correctness and money integrity (2026-07-30)

Fixes the four §1.3 correctness bugs proven by the Stage 0 test harness, plus
the MOV and submit-guard items. See `docs/AUDIT_2026-07.md`.

### ⚠️ Pricing change — read this one

**The Minimum Order Value is no longer charged per line.**

The MOV was being applied twice: `job-detail-card.tsx` floored every individual
line at the MOV, and `new-sales.tsx` then applied it again to the batch. Because
each line had already been floored, the batch-level check could never fire — it
was dead code. The effect was that a multi-line order paid the minimum once per
line.

The MOV is a minimum on the **order**, and is now applied once, to the goods
subtotal, as a labelled adjustment row.

| Order | Before | After |
|---|---|---|
| 1 line @ ₦600 | ₦3,000 → n/a; charged ₦1,000 | ₦1,000 — **unchanged** |
| 3 lines @ ₦600 (MOV ₦1,000) | **₦3,000** | **₦1,800** |

Single-line orders are unaffected. Multi-line orders below the MOV get cheaper.
**This is the only change in Stage 1 that alters what a customer is charged.**

Quotes were previously not applying the MOV at all, so a quote and the sale it
converted into could total differently. Both now price through the same module.
`convertQuoteToSale` carries the quote's stored figures across unchanged rather
than re-pricing, so a quote given under an old MOV is honoured at that price.

### Bugs fixed

- **"Today" was computed in UTC.** `computeDashboardMetrics` compared
  `toISOString()` date strings. Lagos is UTC+1, so a sale logged at 00:30 WAT
  fell on the previous UTC date and dropped out of Today's figures entirely.
  There were four separate definitions of "today" in the app; there is now one
  (`isSameLocalDay` / `localDayKey`).
- **`dueDate` was ignored.** Overdue came from a fixed 7-day window on
  `createdAt`, so a sale on 30-day terms flagged Overdue on day 8 and a sale
  whose 3-day terms lapsed yesterday looked fine. Overdue now uses `dueDate`
  when set, otherwise `createdAt + defaultTermsDays` (new, in Settings).
- **The transaction detail screen misreported Subtotal.** It computed
  `subtotal = grandTotal - delivery`, which silently folded the MOV top-up into
  the figure labelled "Subtotal" — showing ₦1,000 of printing on a ₦600 job.
  This was a live bug visible to anyone opening a transaction, not merely a
  field being migrated. The batch review card had the same defect, labelling
  `max(subtotal, mov)` as "Items Subtotal".
- **Overdue and Unpaid were visually identical** in `STATUS_META` — the same
  text colour and the same background, so the status needing action today was
  indistinguishable from the one that does not. Overdue is now deep red and
  filled; the others stay outlined, so the two differ by shape as well as hue.
- **Fractional kobo on invoices.** `formatCurrency` used a bare
  `toLocaleString()`, which defaults to 3 fraction digits and follows the
  device locale — so the same invoice already rendered differently on different
  phones. Pinned to `en-NG`, zero fraction digits.
- **Double-tap created two sales.** New Sale now guards on `isSubmitting` and
  disables the button while the write is in flight.
- **Bare `alert()` did nothing on native.** Twelve call sites — failed payments,
  failed exports, failed "mark as paid" — showed no feedback at all on the
  surface the operator actually uses. All now `Alert.alert`.

### Added

- `src/utils/money.ts` — the single home for money arithmetic. Line totals round
  to whole naira at write; the subtotal is their exact sum; every naira above it
  is a named adjustment. `formatCurrency`'s rounding is now a safety net rather
  than the thing hiding the drift.
- `subtotal` and `adjustments[]` on batches and quotes, as an immutable
  write-time snapshot. Never recomputed from live Settings, so raising the MOV
  next quarter cannot restate a historic invoice.
- `deriveLegacyMoneyFields` — reconstructs both fields for records written
  before they existed, from stored data alone, so historic invoices reconcile
  too. Backfillable by a later migration, after which the shim deletes.
- `formatCurrencyCompact()` for dashboard tiles only — never tables or invoices.
- `defaultTermsDays` in Settings, with the MOV field now explaining that it
  applies to printing only.

### Noticed, not fixed

- **`invoice.tsx` has two renderers** — the HTML export and the on-screen view.
  They read the same totals, so they cannot disagree on numbers, but the markup
  is duplicated and can still drift. They should share one data-shaping
  function so the PDF a customer receives and the screen it was checked on
  cannot diverge.

---

## v0.7

Dashboard migrated

Theme migrated

KPICard added

---

## v0.8

Sales redesign

Transaction Details

Bottom Action Bar

---

## v0.9

Inventory

Production

Expenses
