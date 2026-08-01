# BOMedia Sales — Architecture & UI/UX Audit

**Repo:** `enfash/bomedia-sales` @ `main`
**Reviewed:** 28 July 2026
**Scope:** 14,382 LOC across 98 TS/TSX files, Expo SDK 57 / RN 0.86 / React 19 / Firebase Realtime Database / react-native-paper
**Reviewer note:** static review only — no simulator, no live database, no production data volumes.

---

## 0. Verdict up front

This is a genuinely well-organised codebase for a solo-built internal tool. The repository/normalized-type separation, the `STATUS_META` single source of truth, the pure `analytics.ts` selectors, and the honesty of the doc set (`PROJECT_STATUS.md` is better than most funded startups keep) all put it well above the usual "AI-assisted app" standard.

The problems are not layout or polish. They are three:

1. **The data layer will not scale past a few months of trading.** Every screen subscribes to the entire `sales` tree.
2. **The money model has no ledger and no concurrency safety.** Payments are a mutable float on the batch, updated by a client-side read-modify-write.
3. **Nothing is tested and the financial logic is where the bugs are.** Four concrete correctness bugs are identified below, all of which a handful of unit tests would have caught.

Everything else is secondary.

---

## 1. Architecture

### 1.1 What is working — keep these

| Decision | Why it's right |
|---|---|
| `services/sales-repository.ts` + `services/quote-repository.ts` as the only Firebase-path builders | Screens stay dumb. When you change storage layout (and you will — see 1.2), it's one file. |
| `Stored*` (raw) vs `SalesBatch`/`SalesRecord` (normalized) types | Correct instinct. The raw shape is Firebase's problem, not the UI's. |
| Status derived from amounts, never read from storage (`computePaymentStatus`) | Eliminates an entire class of "the chip says Paid but the balance is ₦40,000" bug. |
| `STATUS_META` as the only place status colours live | Genuinely enforced across most of the app. |
| `analytics.ts` as pure, I/O-free selectors | Best-designed file in the repo. Also the easiest to test — and currently untested. |
| `withAlpha()` instead of hex string-append | The reasoning documented in `PROJECT_STATUS.md` is exactly right. |
| Legacy read shim isolated to one function with a delete-me note | Textbook. Most codebases smear this everywhere. |
| Security rules are role-based and default-deny | The remediation from open rules landed properly. `users/$uid/role` self-escalation is blocked by the `.validate`. |
| `docs/` maintained as real handoff state | This is why an outside review is even possible. |

### 1.2 Critical — fix before the data grows

**(A) Whole-tree subscription. `sales-repository.ts:subscribeToBatches` → `db.ts:subscribe('sales')`**

```ts
export function subscribeToBatches(callback) {
  return dbService.subscribe(SALES_ROOT, (root) => callback(parseSalesTree(root)));
}
```

This downloads **every sale ever recorded** and re-walks the whole tree on **every single write**. `useRecords()` is consumed by Records, Clients, Board, Dashboard and Analytics — five surfaces, same firehose.

Cost projection at 20 sales/day with 3 line items each:

| Trading period | Batches | Approx. payload per sync |
|---|---|---|
| 1 month | ~500 | ~350 KB |
| 6 months | ~3,000 | ~2 MB |
| 2 years | ~12,000 | ~8 MB |

On Lagos mobile data, an 8 MB re-download every time your operator moves a kanban card is not a performance nit — it's an unusable app and a real airtime cost. And it happens on cold start of *every* screen.

The date-bucketed path `sales/{YYYY}/{MM}/{DD}/{receiptId}` was chosen to make this scoped, then the code ignores the buckets and reads the root anyway. Fix:

- `subscribeToRange(fromDate, toDate)` — subscribe to specific `sales/{YYYY}/{MM}` nodes, not `sales`.
- Records/Board/Dashboard default to current month; "All time" becomes an explicit, deliberate action.
- Clients and Analytics need cross-period totals — those should read from a **maintained rollup** (`aggregates/monthly/{YYYY-MM}` and `aggregates/clients/{clientId}`) written on each sale, not recomputed from raw history on the client.

Same pattern in `activity.ts:subscribeToActivity` — it pulls the entire activity log and then `.slice(0, limit)` client-side. Use `limitToLast(limit)`; the whole point of the `atMs` field is currently wasted. And `use-all-expenses.ts` subscribes to every month of expenses by design.

**(B) No payment ledger, and payments race.**

```ts
export async function recordPayment(batch: SalesBatch, amount: number) {
  const next = (batch.totalPaid || 0) + amount;   // read from stale client state
  await dbService.updateRecord(batch.dbPath, { totalPaid: next });
}
```

Two problems, both serious for a cash business with staff:

- **Lost writes.** Your admin records ₦5,000 on her phone while you record ₦10,000 on the desktop. Both read `totalPaid: 0`. Last write wins; ₦5,000 vanishes with no error and no trace. Needs `runTransaction()` or `increment()`.
- **No audit trail.** `totalPaid` is a single mutable number. You cannot answer: who collected this? when? cash or transfer? was it reversed? `logActivity` writes a *prose sentence* into an admin-only feed — that's a notification, not an accounting record, and it can't be reconciled or summed.

The fix is the single highest-value change in this document: **payments become append-only child records.**

```
sales/{YYYY}/{MM}/{DD}/{receiptId}/payments/{pushId}
  { amount, method, atMs, byUid, byName, note?, reversalOf? }
```

`totalPaid` becomes derived (sum of payments) or a transactionally-maintained cache. Corrections are new negative entries, never edits. That gives you a daily cash-reconciliation report for free — "Ada collected ₦47,500 today: ₦20,000 cash, ₦27,500 transfer" — which is the thing that actually protects you.

**(C) Money is a float.**

`totalAmount`, `unitPrice`, `total`, `totalPaid` are all plain JS numbers of Naira, and `formatCurrency` is:

```ts
return `₦${amount.toLocaleString()}`;
```

`toLocaleString()` with no options will happily render `₦1,234.5600000000001` once float error accumulates through `Math.max(subtotal, mov) + parseFloat(deliveryCost)`. Two fixes, pick one and be absolute about it:

- **Integer kobo** everywhere in storage, one formatter at the render edge. Correct, but a migration.
- **Minimum:** `Math.round()` at every write boundary and `toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })` in the formatter.

Also add a `formatCurrencyCompact()` for dashboard KPIs — `₦2.4M` reads far better than `₦2,431,500` in a stat card.

**(D) Receipt IDs can silently overwrite.**

```ts
const rand = Math.random().toString(36).substring(2, 6).toUpperCase();  // 4 chars
...
await dbService.setRecord(dbPath, node);   // set() overwrites without complaint
```

Client-generated ID + `set()` = a collision destroys the earlier sale. The window is small (~1.7M combinations per day) but the failure is total and silent. Also: nothing stops two devices generating the same ID offline. Either use `push()` keys as the storage key (keeping the human-readable `receiptId` as a display field), or write via a transaction that fails when the node already exists. Add a `.validate` rule requiring `!data.exists()` for staff creates.

**(E) No submit guard on New Sale.** `submitBatch` has no `isSubmitting` state and the button isn't disabled during the `await`. On a slow connection your operator will tap twice and create two real sales with two different receipt IDs. This is a five-line fix and it is happening in production right now.

### 1.3 Correctness bugs found in review

**1. "Today" is computed in UTC. `analytics.ts:computeDashboardMetrics`**

```ts
const todayStr = now.toISOString().split('T')[0];
...
if (d.toISOString().split('T')[0] === todayStr) { todaySales += 1; ... }
```

Lagos is UTC+1. A sale logged at 00:30 WAT is `23:30` the *previous* day in UTC, so it drops out of "Today's Sales" on the dashboard. Meanwhile `createBatch` buckets the path using **local** date components, and `utils/date.ts:isToday` correctly uses local components — so you have three different definitions of "today" in one app. Standardise on local (or on an explicit `Africa/Lagos`) and delete every `toISOString().split('T')[0]`.

**2. `dueDate` is ignored by overdue logic.**

```ts
const status = computePaymentStatus(totalAmount, totalPaid, isOverdue(node.createdAt));
// isOverdue(createdAt, thresholdDays = 7)
```

A sale explicitly given a 30-day `dueDate` flags **Overdue** on day 8. A sale with a 3-day `dueDate` looks fine on day 5. The `dueDate` field is written, stored, editable in the UI, and then never consulted. Should be: `isOverdue(batch.dueDate ?? addDays(batch.createdAt, settings.defaultTermsDays))`.

**3. Minimum Order Value silently inflates the total.**

```ts
const finalBatchTotal = Math.max(batchSubtotal, settings?.mov || 1000) + delivery;
```

Your operator adds items totalling ₦600, and the app charges ₦1,000 with no line item, no label, and no explanation. The customer's invoice won't reconcile against the item list. MOV should appear as a visible adjustment row ("Minimum order adjustment: +₦400") in `BatchReviewCard` and on the invoice.

**4. Overdue and Unpaid are visually identical.** In `STATUS_META`, both are `color: '#ba1a1a', bg: '#ffdad6'`. The whole point of separating the statuses is that one demands a phone call today. Give Overdue its own treatment — deeper red, or a filled chip against Unpaid's outlined one, or a small clock glyph.

### 1.4 Structural issues

**Read-side RBAC is UI-only.** The rules grant `sales/.read` and `quotes/.read` to *any* authenticated user. `staffTodayOnly` in `use-records.ts` is a `.filter()` in JavaScript. Your machine operator can read every sale, every client, and every price you've ever charged straight from the Firebase SDK. With a 3-person team you may accept that — but decide it consciously rather than believing the UI is a boundary. If you want it real, the date-bucketed paths make it easy: `sales/$y/$m/$d/.read` conditioned on `$d === today || isAdmin`.

**No `.indexOn` in the rules.** `db.ts:subscribeQuery` uses `orderByChild`, which without a matching `.indexOn` makes Firebase download the node and sort on the client, with a console warning. Add `.indexOn` for any child you order by.

**Web/native fork duplication.** `index`/`records`/`clients`/`analytics`/`app-tabs`/`animated-icon` all exist as `.tsx` + `.web.tsx` pairs — roughly 1,700 LOC of parallel screens. Metro's platform-swap is the right *mechanism*, but the split is currently at the **screen** level, so business logic (filters, KPI math, bulk actions) is written twice and will drift. Push the split down: one screen per route owning the data and logic, delegating only *presentation* to `<RecordsView>` / `<RecordsView.web>`. `records.tsx` (190 LOC) and `records.web.tsx` (439 LOC) already differ in more than layout.

**Hard deletes contradict the audit-trail design.** `deleteBatch` → `remove()`. You log a `sale_deleted` activity message, but the sale itself is gone — including its payments. For a financial record, soft-delete (`voidedAt`, `voidedBy`, `voidReason`) with filtering on read, and let only admin void. Cancelled jobs are a normal event in printing; erasing them is not.

**No tests, no CI.** 14,382 LOC, real money, zero tests. `analytics.ts`, `payment-status.ts`, `date.ts` and `sales-repository.ts`'s normalizers are pure functions — every bug in §1.3 lives in them and every one is a five-line test. Add Jest + `jest-expo`, write ~30 tests over those four files, and a GitHub Action running `tsc --noEmit` + `expo lint` + `jest` on push. This is a two-hour job that pays for itself immediately.

### 1.5 Hygiene

- **121 hardcoded hex colours** across `src/app` and `src/components`, despite the theme + `STATUS_META` rule. That's the dark-mode bug class waiting to recur.
- **`Colors` in `constants/theme.ts` has only a `light` key**, and the file still carries the Expo template's boilerplate comment. Meanwhile `use-color-scheme.ts` and Paper's dark theme are both live. Either commit to dark mode or remove the scaffolding.
- **79 `any`s.** The worst is `batchItems: any[]` in `new-sales.tsx` — the *core* create path is untyped, which is why `JobDetailCard`'s output shape is unverified against `StoredItem`.
- **Firebase config hardcoded in `src/lib/firebase.ts`.** The web API key isn't a secret, but move it to `app.config.ts` + `EXPO_PUBLIC_*` env vars so staging/prod can differ, and restrict the key by referrer/package in Google Cloud Console.
- **`Alert.alert` vs bare `alert()`** mixed inside the same function in `new-sales.tsx`.
- **Error copy leaks internals:** `'Failed to submit batch. Check your connection or Firebase config.'` Your operator cannot check a Firebase config. Say what to do: "Couldn't save — you're offline. It'll send when you reconnect."
- **No error boundary** at the root layout. One render throw in a chart = white screen with no recovery.
- **Hardcoded `targetRevenue = 1000000`** in `use-records.ts` — belongs in Settings alongside `mov`.
- **Legacy shim + un-run migration** still outstanding per `PROJECT_STATUS.md`. Run it and delete `adaptLegacyRecords` — it currently double-walks the tree on every sync.

---

## 2. UI / UX

### 2.1 Strong

- **The dual-surface strategy is the right call.** Mobile as a lean field tool, web as the dense admin dashboard, one codebase. That's the correct read of how a print shop actually works — operator on the floor with a phone, owner at a desk.
- **The Records mobile card-list vs web data-table split** respects each form factor instead of shrinking a table.
- **Balance-led transaction detail** with collection-progress bar — leads with the number that matters (what's owed), not a receipt reprint.
- **⌘K command palette, density toggle, persisted filters, CSV export** — real admin-tool affordances, not decoration.
- **View-based charts with no chart library** — keeps the bundle lean and the visual language consistent. Correct trade-off at this scale.
- **Production kanban mapped to the actual 10ft-machine workflow** (Queued → Printing → Finishing → Ready → Delivered), and moving a card writes through to the database. The board is a real control surface, not a display.
- **Badge counts on the More menu** for ready-to-dispatch and clients-owing — pulls the two decisions that need attention up into the chrome.
- **Design tokens exist** (`Spacing`, `MaxContentWidth`, `WebContentMaxWidth`) and the web pages share one content column, so tab-switching doesn't shift edges.

### 2.2 Weak

**Accessibility is essentially absent.** 14 accessibility props across 10 files, against 72 components. Every icon-only button (`icon-button.tsx`, kanban controls, table sort headers) is unlabelled — invisible to a screen reader and, more practically for you, undiscoverable to a new staff member. Add `accessibilityLabel` + `accessibilityRole` to every icon-only control, and check that touch targets clear 44×44.

**No offline story, and this is your biggest UX gap.** The Firebase RTDB SDK queues writes offline, which means `await dbService.setRecord(...)` **never resolves** with no connection. Your operator taps "Submit", nothing happens, no spinner ends, no error appears. They tap again (see §1.2E). On Lagos connectivity this is the defining condition, not an edge case. You need:

- A persistent connection indicator (`.info/connected`) in the header.
- Optimistic UI: the sale appears in Records immediately, marked "Pending sync".
- Explicit copy on the button: "Saved locally — will sync when you're back online."

**Client name is free text.** No `clients` collection; `clients.web.tsx` aggregates by exact string match. `Blessing Prints`, `blessing prints`, and `Blessing Print` become three customers with three balances — and your debt-collection view quietly under-reports. This is the highest-value data-model addition: a real `clients/{clientId}` node, with typeahead on the New Sale form and merge-duplicates in admin. It also unlocks per-client history, credit limits, and WhatsApp reminders.

**No search on mobile Records beyond client name and material.** Your staff will search by receipt ID and by phone number — neither is matched in `useRecords`'s `searchedBatches` filter.

**Destructive actions.** `confirm-dialog.tsx` exists, but delete is a permanent erase of a financial record behind a single confirm. For voids, require typing the receipt ID, or at minimum a reason field (which you need for the audit trail anyway).

**Empty states are generic.** `empty-state.tsx` is reused everywhere. First-run empties should teach: the empty Board should say "Jobs appear here once you record a sale" with a link to New Sale, not "No items".

**No loading→content transition on the charts.** `loading-skeleton.tsx` exists but the analytics widgets appear to mount straight from empty, which reads as a broken page on slow data.

**Naira formatting in dense tables.** Full `₦1,234,500` strings in every cell of a paginated data table are hard to scan and compare. Right-align numeric columns, use tabular/monospace figures, and compact the KPI cards.

---

## 3. Prioritised plan

### P0 — this week (correctness and money integrity)

1. **Submit guard** on New Sale — disable the button while in flight. *(15 min)*
2. **Fix the UTC "today" bug** in `analytics.ts`; standardise on local date helpers from `utils/date.ts`. *(30 min)*
3. **Make `dueDate` drive overdue status**; add `defaultTermsDays` to Settings. *(1 hr)*
4. **Payments become append-only child records**, `totalPaid` written via transaction/`increment`. Migration: fold each existing `totalPaid` into one synthetic opening payment entry. *(1 day — the most valuable day of work in this plan)*
5. **Soft delete / void** instead of `remove()`, admin-only, reason required. *(2 hrs)*
6. **Round money at every write boundary** and pin the formatter's fraction digits. *(1 hr)*
7. **Jest + ~30 unit tests** over `analytics.ts`, `payment-status.ts`, `date.ts`, and the repository normalizers. Plus a CI action. *(half day)*

### P1 — this month (scale and offline)

8. **Scope the subscriptions.** `subscribeToRange` reading month nodes; Records/Board/Dashboard default to current month. *(1–2 days)*
9. **Monthly and per-client rollups** written on each sale, so Clients and Analytics stop replaying full history. *(1–2 days)*
10. **`limitToLast` on the activity feed**; add `.indexOn` to the rules. *(1 hr)*
11. **Offline UX:** connection indicator, optimistic write, pending-sync badge, human error copy. *(1–2 days)*
12. **A real `clients` collection** with typeahead on New Sale and duplicate-merge in admin. *(2 days)*
13. **Accessibility labels** on every icon-only control; touch-target audit. *(half day)*
14. **Run the migration, delete the legacy shim.** *(1 hr)*

### P2 — next quarter (structure)

15. **Refactor the web/native split down to presentation components** so business logic exists once.
16. **Kill the 121 hardcoded hexes**; commit to dark mode or remove the scaffolding.
17. **Type the New Sale form path**; eliminate `batchItems: any[]`.
18. **Root error boundary**; move Firebase config to env; restrict the API key.
19. **Server-authoritative read RBAC** if you decide staff shouldn't see all history.
20. **Move `targetRevenue` and other magic numbers into Settings.**

---

## 4. What to include next — features

Ordered by value to a Lagos large-format print shop, not by build difficulty.

### Tier 1 — directly makes or protects money

**Debtor follow-up with WhatsApp.** You already compute per-client outstanding balance. Add a "Owing" view sorted by age, one tap to open WhatsApp with a pre-filled, polite reminder including the receipt ID and balance. This is the single highest-ROI feature you could ship — it turns a report into collected cash, and it needs no new data model.

**Daily cash reconciliation.** Falls out of the payment ledger free: end-of-day total collected, split by method and by staff member, versus what's physically in the drawer. This is what closes the gap between trusting your staff and verifying.

**Material/roll inventory with consumption.** You already capture width, height, quantity and material per line item, so square-footage consumed is computable today. Deduct from roll stock, alert at reorder level. You explored the two-level model (Material Profiles for cashiers, Roll Log for admin) — that design is right and this is the largest remaining hole in the app. Without it, you can't tell whether a job was profitable or whether tomorrow's jobs are runnable.

**True job costing.** Revenue minus material consumed minus labour minus waste factor, per job. `settings` already holds `wasteFactor`, `laborCost`, `laminationCost`, `eyeletCost` — they're used for pricing but never for margin. Right now your dashboard shows gross revenue and calls the material-blind result "margin". A per-material and per-client profitability view would tell you which of your regulars you're subsidising.

**Deposit policy enforcement.** Configurable minimum advance (e.g. 50% before printing) with the Board refusing to move a job from Queued to Printing below threshold, overridable by admin with a reason. Turns a policy you enforce by memory into one the app enforces.

### Tier 2 — reduces friction and errors

**Reprint / repeat order.** "Same as last time" is the most common request in this business. One tap on a past job to clone it into a new sale.

**Quote expiry and follow-up.** Quotes have `Draft`/`Sent`/`Converted` but no expiry and no nudge. Material prices move; a 6-week-old quote at old prices is a loss. Add `validUntil`, an expiry badge, and a follow-up list for un-converted quotes.

**Delivery / dispatch tracking.** A `Delivered` stage exists on the Board but records no proof — who collected, when, signature or photo. Removes the "I never received it" dispute.

**Customer-facing job status link.** A read-only link (`/track/{receiptId}`) showing production stage and balance. Cuts the "is my banner ready?" calls significantly, and you already have the web surface to host it.

**Print-shop-shaped quote calculator.** Your sticker-layout and ink-coverage work already lives outside this app. Folding roll-width nesting into the quote form — "this artwork at this size wastes 40% of a 4ft roll; at 3.5ft it wastes 5%" — is a genuine competitive edge and it's logic you've already written elsewhere.

**Receipt via WhatsApp, not just PDF share.** `expo-print` → `Sharing.shareAsync` works, but a direct WhatsApp deep link with the invoice attached matches how your customers actually want to receive it.

### Tier 3 — later

- **Expense categories tied to jobs** (ink, transport, casual labour) so cost of goods is real rather than a monthly lump.
- **Recurring / contract clients** with agreed rate cards, so pricing doesn't depend on who's at the counter.
- **Supplier / purchase orders** for roll restocking, closing the inventory loop.
- **Staff performance view** — sales logged, collection rate, jobs completed per operator.
- **Backup export** — scheduled JSON/CSV dump to Drive. You have exactly one copy of your entire business history in one Firebase project with no export routine. Fix this earlier than "later" if nothing else on this list gets done.
- **Push notifications** for ready-to-dispatch and overdue balances.

---

## 5. The one-paragraph summary

The bones are good — repositories, typed domain model, derived status, pure selectors, honest docs. Three things need to change before this becomes the system of record for a real business: subscriptions must be scoped to date ranges instead of pulling the whole `sales` tree, payments must become an append-only ledger written transactionally instead of a mutable float, and the pure financial functions need tests (which will immediately catch the UTC "today" bug, the ignored `dueDate`, and the silent MOV inflation). After that, the two features that will change how the business runs are debtor follow-up over WhatsApp and material inventory with consumption tracking — both of which are mostly derivable from data you're already capturing.
