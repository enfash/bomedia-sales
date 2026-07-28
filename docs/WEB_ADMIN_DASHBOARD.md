# Web Admin Dashboard — Plan

**Goal:** the web/desktop build should feel like a real admin dashboard (Stripe / Linear / Notion), not the phone screens stretched wide. Mobile stays a simple, fast field tool. One codebase, two surfaces.

_Status: planned, not yet built (as of 2026-07-24)._

---

## Guiding rules

1. **Share routes and data, diverge only in presentation.** Screens live once under `src/app/(tabs)/`. The mobile and web *chrome* already diverge via `app-tabs.tsx` (bottom bar) vs `app-tabs.web.tsx` (sidebar). Extend that pattern — never fork a route.
2. **Two levers for web-specific UI:**
   - **`Component.web.tsx` variants** — Metro auto-picks these on web. Best when the desktop layout is substantially different (e.g. a data table vs a card list).
   - **Responsive branches** — `const isWide = useWindowDimensions().width >= 768` inside a shared component. Best for small differences (columns, spacing).
3. **Reuse the existing spine:** typed models (`src/components/records/types.ts`), repositories (`sales-repository.ts`, `quote-repository.ts`), and `STATUS_META` colours. The dashboard is a new *view* over data we already have — no new storage.
4. **Never regress mobile.** Every change keeps the phone build simple; gate richness behind web/width checks.

---

## Building blocks to add

- **`src/components/dashboard/` (web-first components):**
  - `StatCard` — KPI tile (label, big number, delta vs last period, sparkline).
  - `DataTable` — sortable, filterable, paginated table with row actions (desktop replacement for mobile card lists on Records/Clients).
  - `ChartCard` — titled container around a chart.
  - `DashboardLayout` — the desktop content shell: top bar (global search, date-range picker, business name) + responsive CSS grid.
- **`src/services/analytics.ts` — pure aggregation selectors** over `SalesBatch[]` / expenses, e.g.:
  - `revenueByMonth`, `revenueByMaterial`, `collectedVsOutstanding`
  - `productionThroughput` (jobs per stage, avg time in stage)
  - `expensesVsRevenue`, `topClients`
  These are unit-testable and feed both charts and tiles.
- **Charts:** on web the bundle can use the DOM, so a `.web.tsx` chart component using **Recharts** (or visx) is the pragmatic choice — clean, responsive, themeable. Keep charts in web-only files so the native bundle never imports them. Follow the `dataviz` skill for palette/legibility.

---

## Phased delivery

**Phase 1 — Dashboard Home (web).** Add `src/app/(tabs)/index.web.tsx` rendering `DashboardLayout` with:
- KPI row: MTD Revenue, Collected, Outstanding, Net Profit (reuse `useRecords` + `useExpenses`).
- Revenue trend chart (`revenueByMonth`).
- "Needs attention" panel: jobs **Ready** to dispatch, clients owing (the same signals now on the mobile More badges).
- Recent sales table (last N, `DataTable`).
Mobile `index.tsx` is untouched.

**Phase 2 — Dense tables.** `records.web.tsx` and `clients.web.tsx` swap the mobile card list for `DataTable` (column sort, status filter, search, pagination, CSV export — the CSV logic already exists in `records.tsx`).

**Phase 3 — Analytics page.** New route `src/app/(tabs)/analytics.tsx` (web-only entry in the sidebar; hidden or "coming soon" on mobile). Charts: revenue over time, revenue by material, production throughput, expenses vs revenue, top clients. All from `analytics.ts`.

**Phase 4 — Power-user polish.** Global command/search palette (⌘K), keyboard navigation, saved filters, density toggle, and per-widget date-range control.

---

## Sequencing notes

- Do **Phase 1** first — highest value, proves the `DashboardLayout` + `.web.tsx` pattern end-to-end.
- Build `analytics.ts` selectors before charts so the data shape is settled and testable.
- Add an "Analytics" entry to the **web sidebar** (`app-tabs.web.tsx`) only; the mobile bar/More menu stays as-is.
- Keep `npx tsc --noEmit` and `expo lint` green after each phase.

See also: `docs/VISION.md`, and memory `platform-strategy`.
