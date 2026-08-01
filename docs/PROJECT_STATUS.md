# BOMedia — Project Status & Handoff

_Last updated: 2026-07-24_

A running handoff so any new session can continue effectively. Source-of-truth docs: this file, `docs/VISION.md`, `docs/WEB_ADMIN_DASHBOARD.md`.

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
- **Two nav chromes, shared routes:** `src/components/app-tabs.tsx` = native bottom bar (4 tabs: Home/Quote/New Sale/Records + **More** side menu); `src/components/app-tabs.web.tsx` = desktop sidebar (all 8 destinations). Secondary pages (Board, Clients, Expenses, Settings) are behind **More** on mobile.
- **Root-stack routes on web need `WebDetailShell`.** `transaction/[id]`, `cash`
  and `activity` live in the root Stack (deliberately — that is what gives them
  a real back button and fixed the "back goes Home" bug). The sidebar is
  rendered by the tabs navigator, so without help those routes cover the whole
  window on web. `src/components/web-detail-shell.web.tsx` reproduces the
  sidebar chrome around them; the native file is a passthrough, so mobile is
  untouched. **Any new root-level route must wrap its content in
  `<WebDetailShell>`.** `invoice.tsx` deliberately does not — it is a printable
  full-bleed document. The sidebar's destinations live in
  `src/constants/web-nav.ts`; add new ones there AND as a `TabTrigger` in
  `app-tabs.web.tsx` (see the §7 parser gotcha — the triggers cannot be mapped
  from the list).
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
7. **Side navigation** — mobile 4 tabs + **More** menu (`src/components/more-menu.tsx`); web sidebar lists all 8. **Badges**: Ready-to-dispatch jobs + clients-owing counts on More items and a dot on the More tab (`src/hooks/use-more-badges.ts`). ⚠️ **Web sidebar gotcha:** `TabTrigger`s must be *direct* children of `TabList`/`CustomSidebar` — expo-router's parser only recurses into Fragments/nested TabLists, never `<View>` wrappers, so grouping triggers in `<View>`s silently kills those routes (only the un-wrapped trigger navigates). Grouping is done with a plain divider + `flex:1` spacer sibling and `navArea` gap instead.
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

- **Verify on a real device/browser** (the assistant environment can't launch a simulator or screenshot): badges & More menu, transaction back button, quote add→convert flow, and the web dashboard visuals (`npm run web`).
- **Run the migration** if any legacy flat sales records exist: `node scripts/migrate-sales.mjs` (dry-run) then `--commit`; afterwards delete the `adaptLegacyRecords` legacy shim in `sales-repository.ts`.
- **Verify `records.web.tsx` in a browser** (`npm run web`): sort headers, status/date filters, search, pagination, select-all + bulk actions (CSV export, Mark paid, Generate invoice), row → transaction detail.
- **Verify `analytics.web.tsx` in a browser** (`npm run web` → Analytics in the sidebar): all six charts render, expenses-vs-revenue reflects multiple months, throughput/material/client bars look right. Confirm the mobile route shows the stub (not the dashboard).
- **Web dashboard, remaining phases** (see `docs/WEB_ADMIN_DASHBOARD.md`):
  - **Phase 2** — ✅ done. Records + Clients desktop tables on the reusable `DataTable`.
  - **Phase 3** — ✅ done. Analytics page + selectors + View-based chart primitives.
  - **Phase 4** — ✅ done (agreed scope). Global **⌘K command palette** (`src/components/dashboard/command-palette.tsx`, mounted in `app-tabs.web.tsx` + sidebar "Search ⌘K" button): fuzzy search over navigation / quick actions / transactions, full keyboard nav (⌘K toggle, ↑↓, ↵, Esc), jumps to transaction detail. **Density toggle** (`hooks/use-density.ts` external store + `dashboard/density-toggle.tsx`) wired into `DataTable` + Records/Clients toolbars, persisted. **Auto-remembered Records filters** — `useRecords(theme, { persistKey })` persists status/date/sort to localStorage (opt-in per call so only Records persists; search stays transient). **Page-level Analytics date range** — one 3M/6M/12M control in the header filters every widget (window-filters batches/expenses, drives all selectors). Deliberately skipped: named saved views and global `g`-shortcuts (⌘K already covers navigation).
- **Nice-to-haves:** tighten remaining `any`s (the form-item objects out of `JobDetailCard`); optional static HTML preview artifact of the dashboard for quick visual review.

---

## Starting a new conversation effectively

Give one concrete task, e.g.:
- "Phase 2: build the Records desktop data-table (`records.web.tsx`)."
- "Run/verify the web dashboard and refine spacing."
- "Wire the Analytics page (Phase 3), starting with the analytics selectors."

The `platform-strategy` memory loads automatically. Point me at this file for full context.
