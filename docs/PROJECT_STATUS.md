# BOMedia — Project Status & Handoff

_Last updated: 2026-08-03_

A running handoff so any new session can continue effectively. Source-of-truth docs: this file, `docs/VISION.md`, `docs/WEB_ADMIN_DASHBOARD.md`. For everything since the July audit — Stages 1–3, the payment ledger, void, the security rules — `docs/AUDIT_2026-07.md` is the record, and `docs/DATABASE_RUNBOOK.md` covers anything touching production data.

---

## ⚠️ What has NOT been verified

Read this before drawing any conclusion from a green test run.

**`docs/GATE_CHECKLIST.md` is written and UNRUN.** Stages 1, 2 and 3 — the
pricing arithmetic, the append-only payment ledger, void-instead-of-delete —
all gate on real transactions, and **not one of them has had one**. No part of
the financial logic has been exercised against a real sale, a real payment or a
real void. The tests, `tsc` and lint are green; that is not the same claim and
has already failed to be:

> 322 unit tests, clean `tsc`, clean lint and deployed rules did not stop New
> Sale being completely broken for any sale taking an advance.

The runtime has disagreed with what the rules *looked* like they said twice
(`.validate` skipping deletes; multi-path ancestor paths), and on 2026-08-03 the
security rules turned out to have been deployed to the wrong database for
months — the app's own database was on `read/write: anyone signed in` the whole
time. Static checks saw none of it.

**The web chrome has never been rendered in a browser.** The top bar, the
detail-screen page bars and the unified sidebar (`d38267c`) were written,
typechecked, linted and tested — and never once looked at. That is a known
unknown, not a known bug: no visual defect is recorded because nobody has seen
the pages. Treat any complaint about layout as unverified work rather than a
regression.

**What has been verified**, so the line is clear: the security rules are live on
`bomedia-official` and diffed against `database.rules.json`; a full backup and a
restore have been taken and rehearsed end to end (`npm run backup`, and
`docs/DATABASE_RUNBOOK.md`).

---

## What the app is

BOMedia internal operations app — Expo Router + React Native (react-native-paper) + Firebase Realtime Database. **One codebase, two surfaces:** a **simple mobile field tool** and a **sophisticated web admin dashboard**. Currency is Naira (₦). Brand primary is indigo `#2e388d`.

---

## Architecture & conventions (follow these)

- **Typed domain model:** `src/components/records/types.ts` — `SalesBatch`, `SalesRecord/SalesItem`, `QuoteRecord`, `PaymentStatus`, `ProductionStage`, `PaymentMethod`, plus raw `Stored*` shapes. UI touches only normalized types.
- **Data access goes through repositories** (never build Firebase paths in screens):
  - `src/services/sales-repository.ts` — subscribe/create/recordPayment/markPaid/updateDetails/delete, `updateProductionStage`, `generateReceiptId`, `fetchBatchesByReceiptIds`.
  - `src/services/quote-repository.ts` — subscribe/create/delete/updateDetails, `convertQuoteToSale` (+ `MissingQuoteInfoError`).
  - `src/services/db.ts` — low-level Firebase wrapper.
  - `src/services/analytics.ts` — pure selectors for the dashboard.
- **Status vocabulary is unified:** `STATUS_META` in `src/utils/payment-status.ts` is the single source for status label + colours everywhere. Never hardcode status colours.
- **Never tint a theme colour by string-appending hex alpha** (`theme.onSurface + '15'`). MD3 **dark** theme colours are `rgba()` strings, so that produces an invalid value that renders fully **opaque** and kills contrast (this caused the dark-mode "solid white active nav item" bug). Use `withAlpha(color, 0–1)` from `src/utils/color.ts` — it handles hex *and* rgba. Brand colours (`primary`/`onPrimary`/`primaryContainer`) are always hex so `+ 'XX'` happens to work on them, but prefer `withAlpha` for consistency.
- **Storage layout (hierarchical, the only format written):**
  - Sales: `sales/{YYYY}/{MM}/{DD}/{receiptId}` (batch node with `items` map, `totalPaid`, `productionStage`).
  - Quotes: `quotes/{YYYY}/{MM}/{DD}/{quoteId}`.
  - Expenses: `expenses/{YYYY-MM}/...`.
- **Navigation:** root **Stack** (`src/app/_layout.tsx`) wraps a **`(tabs)` group**. Detail screens (`transaction/[id]`, `invoice`) live at root and push over the tabs (real back button — this fixed the "back goes Home" bug). Tab routes live in `src/app/(tabs)/`.
- **Two nav chromes, shared routes:** `src/components/app-tabs.tsx` = native bottom bar (4 tabs: Home/Quote/New Sale/Records + **More** side menu); `src/components/app-tabs.web.tsx` = desktop sidebar (all destinations). Secondary pages (Board, Clients, Expenses, Settings) are behind **More** on mobile.
- **On web the top bar owns the app-level chrome, not the sidebar** (`src/components/web-top-bar.tsx`, since `d38267c`). A flat 48px navy strip across the full window carries the brand mark, the quick search, and the icon cluster (apps grid → command palette, activity bell, settings, account). The sidebar below it is destinations only — it no longer holds the logo or a search button. Tokens live in `WebHeader` in `constants/theme.ts`; it is fixed chrome, so it does not switch with the colour scheme.
- **One sidebar, two shells.** `src/constants/web-nav.ts` is the source of truth for every destination's label, icon and group divider, and both shells render the shared `src/components/sidebar-nav-item.tsx`. They used to disagree — the tabs shell hand-wrote "Home" where the detail shell said "Dashboard", and only one drew the divider — so the sidebar appeared to rearrange itself when you opened `/cash`. `web-nav.test.ts` now fails if the tabs shell writes a label of its own or moves the divider.
- **Admin-gated screens use `useAdminGate()`, not `isAdmin`.** `isAdmin` is false while the role is still loading, so a gated screen would show "Admins only" to a real admin and then let them in. The hook splits that into `pending` / `denied` / `allowed`; both sidebars also reserve the admin rows while pending so the nav does not grow under the cursor.
- **Root-stack routes on web need `WebDetailShell`.** `transaction/[id]`, `cash`
  and `activity` live in the root Stack (deliberately — that is what gives them
  a real back button and fixed the "back goes Home" bug). The sidebar is
  rendered by the tabs navigator, so without help those routes cover the whole
  window on web. `src/components/web-detail-shell.web.tsx` reproduces the top
  bar and sidebar around them; the native file is a passthrough, so mobile is
  untouched. It also **hides the native stack header on web** — that header is
  right on a phone but stacked a second header above the top bar on desktop —
  and replaces its two jobs with a page bar carrying the title and a back
  control. Pass the title: `<WebDetailShell title="Daily Cash">`. **Any new
  root-level route must wrap its content in `<WebDetailShell>`.** `invoice.tsx` deliberately does not — it is a printable
  full-bleed document. The sidebar's destinations live in
  `src/constants/web-nav.ts`; add new ones there AND as a `TabTrigger` in
  `app-tabs.web.tsx` (see the §7 parser gotcha — the triggers cannot be mapped
  from the list). **`src/constants/__tests__/web-nav.test.ts` fails if the two
  drift apart**, so this is enforced rather than merely written down. It is a
  source-level parse of `app-tabs.web.tsx` — necessary because the triggers
  cannot be introspected, and honest about its own limits in the file header.
- **There is no hard delete.** `deleteBatch`/`deleteQuote` are gone; `voidBatch`/
  `voidQuote` replace them (admin-only, reason mandatory, confirmation requires
  the receipt id typed back). The rules enforce it: `newData.exists()` on the
  sales and quotes write rules means no client can `remove()` a financial
  record, and payments were already create-only. Voided records are excluded by
  `subscribeToBatches` and `fetchBatchesByReceiptIds` **by default** — the two
  read paths share one default deliberately, since the second bypasses
  `useRecords`. Three callers opt in: both Records twins (Voided filter),
  `transaction/[id]` (so a void reason can be read) and `invoice.tsx` (which
  stamps VOIDED). Voiding does NOT refund: collected cash stays in the ledger.
- **Web sophistication pattern:** prefer `Screen.web.tsx` variants (Metro auto-swaps) and `Platform.OS==='web'` / width checks over forking routes. Example live: `src/app/(tabs)/index.web.tsx`.
- **Quality gate:** keep `npx tsc --noEmit` and `npx expo lint` green. Watch the newer lint rules: no components created during render (`react-hooks/static-components`), no ref access during render (`react-hooks/refs`), no `Array<T>` (use `T[]`).

---

## Done so far

1. **Data-layer refactor** — typed model + repositories; removed the dual-format tree-sniffing that was smeared across screens (isolated legacy shim now lives only in `sales-repository.ts`). Unified status colours. Migration script written.
2. **Transaction Details redesign** — balance-led hero + collection-progress bar + cost breakdown, on the typed model.
3. **Vision alignment pass** — removed off-brand `#0066FF` nav colour, unified greens/reds through `STATUS_META`, deleted duplicate `desktop-sidebar.tsx` and unused `deal-card.tsx`, dropped redundant top header.
4. **Quote rebuilt on real data** — two views in one tab: a **list** of saved quotes (default) and an **Add Quote** form; Share; one-button **Convert to Sale** (prompts for client name if missing). Backed by `quote-repository`.
5. **Board rebuilt on real data** — production kanban for the 10ft machine (Queued → Printing → Finishing → Ready → Delivered); moving a card writes `productionStage` to Firebase.
6. **Navigation restructure** — root Stack + `(tabs)` group; fixed transaction back-navigation.
7. **Side navigation** — mobile 4 tabs + **More** menu (`src/components/more-menu.tsx`); web sidebar lists them all. *(Superseded in part: on web the brand and search moved to the top bar in `d38267c` — see the chrome bullets above.)* **Badges**: Ready-to-dispatch jobs + clients-owing counts on More items and a dot on the More tab (`src/hooks/use-more-badges.ts`). ⚠️ **Web sidebar gotcha:** `TabTrigger`s must be *direct* children of `TabList`/`CustomSidebar` — expo-router's parser only recurses into Fragments/nested TabLists, never `<View>` wrappers, so grouping triggers in `<View>`s silently kills those routes (only the un-wrapped trigger navigates). Grouping is done with a plain divider + `flex:1` spacer sibling and `navArea` gap instead.
8. **Web dashboard Phase 1** — `src/app/(tabs)/index.web.tsx`: KPI row, 6-month revenue bar chart (View-based, no chart lib), Needs-Attention panel, Recent-Sales table. Primitives in `src/components/dashboard/` (`DashboardLayout`, `StatCard`, `Panel`, `RevenueBarChart`).
9. **Web dashboard Phase 2 (Records + Clients)** — desktop data-tables on web (Metro auto-swaps `.web.tsx`; mobile `records.tsx`/`clients.tsx` card lists untouched):
   - `src/app/(tabs)/records.web.tsx` — filter-aware KPI row, toolbar (search + status pills + date menu + CSV export + bulk Mark-paid / Generate-invoice), row → transaction detail.
   - `src/app/(tabs)/clients.web.tsx` — per-client aggregation (lifetime value, collected, balance, jobs, last order) with KPI row, search, sortable columns, CSV export.
   - Reusable **`src/components/dashboard/data-table.tsx`** — generic `DataTable<T>`: column config, controlled sort, optional select-all/row selection, internal pagination, loading/empty states.
   - **Consistent width:** all web pages now share one wide centered content column (`WebContentMaxWidth`/`WebContentPaddingH` in `constants/theme.ts`) via `DashboardLayout` + `PageContainer` (+ Board's web override). Native keeps the narrow `MaxContentWidth` reading column.
   - **Expenses** reworked to the Quote list/add pattern: list-first with an **Add Expense** view and Date/Amount/Category/Name sorting.
10. **Web dashboard Phase 3 (Analytics)** — new web-only route `src/app/(tabs)/analytics.web.tsx` (native `analytics.tsx` is a "see the web app" stub; `href: null` in the mobile bar, sidebar-only on web). KPI row (revenue / expenses / net + margin / collected %), revenue trend, collected-vs-outstanding split, revenue-vs-expenses grouped bars, production throughput, revenue by material, top clients.
    - New pure selectors in `src/services/analytics.ts`: `revenueByMaterial`, `productionThroughput`, `expensesVsRevenue`, `topClients`, `collectedVsOutstanding`.
    - `src/hooks/use-all-expenses.ts` subscribes to the whole `expenses` tree (all months) — the multi-month feed the analytics selectors need (vs `useExpenses` which is single-month).
    - New View-based chart primitives (no chart lib, consistent with Phase 1): `dashboard/bar-list.tsx` (ranked magnitude), `dashboard/monthly-comparison-chart.tsx` (grouped bars, one ₦ axis), `dashboard/split-bar.tsx`. Followed the `dataviz` skill for form/colour/legibility, using the app's brand + `STATUS_META` palette.

---

## Outstanding / next

- **Run `docs/GATE_CHECKLIST.md` on a device.** This is the blocker for everything else, not one item among many — see the verification warning at the top of this file. Stage 4's remaining items and all of Stage 5 are deliberately held behind it.
- **Look at the web app in a browser** (`npm run web`) — the assistant environment cannot render or screenshot. Nothing in the chrome shipped in `d38267c` has been seen: the top bar at both widths, the page bar on `/cash` and `/transaction/[id]`, the sidebar reading identically across both shells, Daily Cash navigating without a full reload, and the admin skeleton rows.
- ~~**Run the migration**~~ — **cancelled 2026-08-01**, and `scripts/migrate-sales.mjs` no longer exists. The database was wiped and restarted clean rather than migrated (`docs/AUDIT_2026-07.md` → "Legacy migration — CANCELLED", `docs/INCIDENT_2026-08-01-data-loss.md`). Do not go looking for that script.
- **Verify `records.web.tsx` in a browser** (`npm run web`): sort headers, status/date filters, search, pagination, select-all + bulk actions (CSV export, Mark paid, Generate invoice), row → transaction detail.
- **Verify `analytics.web.tsx` in a browser** (`npm run web` → Analytics in the sidebar): all six charts render, expenses-vs-revenue reflects multiple months, throughput/material/client bars look right. Confirm the mobile route shows the stub (not the dashboard).
- **Web dashboard, remaining phases** (see `docs/WEB_ADMIN_DASHBOARD.md`):
  - **Phase 2** — ✅ done. Records + Clients desktop tables on the reusable `DataTable`.
  - **Phase 3** — ✅ done. Analytics page + selectors + View-based chart primitives.
  - **Phase 4** — ✅ done (agreed scope). Global **⌘K command palette** (`src/components/dashboard/command-palette.tsx`, mounted in `app-tabs.web.tsx` and `web-detail-shell.web.tsx`; opened by the top bar's quick search, which hands over any keystrokes typed before the palette takes focus): fuzzy search over navigation / quick actions / transactions, full keyboard nav (⌘K toggle, ↑↓, ↵, Esc), jumps to transaction detail. **Density toggle** (`hooks/use-density.ts` external store + `dashboard/density-toggle.tsx`) wired into `DataTable` + Records/Clients toolbars, persisted. **Auto-remembered Records filters** — `useRecords(theme, { persistKey })` persists status/date/sort to localStorage (opt-in per call so only Records persists; search stays transient). **Page-level Analytics date range** — one 3M/6M/12M control in the header filters every widget (window-filters batches/expenses, drives all selectors). Deliberately skipped: named saved views and global `g`-shortcuts (⌘K already covers navigation).
- **Nice-to-haves:** tighten remaining `any`s (the form-item objects out of `JobDetailCard`); optional static HTML preview artifact of the dashboard for quick visual review.

---

## Starting a new conversation effectively

Give one concrete task, e.g.:
- "Phase 2: build the Records desktop data-table (`records.web.tsx`)."
- "Run/verify the web dashboard and refine spacing."
- "Wire the Analytics page (Phase 3), starting with the analytics selectors."

The `platform-strategy` memory loads automatically. Point me at this file for full context.
