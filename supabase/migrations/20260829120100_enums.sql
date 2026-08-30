-- ============================================================================
-- Enums (from the old Next.js/Sheets app's lib/constants.ts, reconciled
-- against the live Expo app where the two disagree)
-- ============================================================================

create type user_role as enum ('admin', 'staff');
-- Only two roles exist (docs/RBAC.md). No 'cashier' — Supabase Auth plus this
-- role column on `profiles` replaces the old plaintext-passcode cashiers table.

create type payment_method as enum ('Transfer', 'POS', 'Cash');
-- The old app's lib/constants.ts spells this 'Bank Transfer'; the live Expo
-- payment ledger (src/components/records/types.ts, PaymentEntry.method)
-- writes 'Transfer'. Using 'Transfer' here — the Expo app is the one being
-- kept, and this enum should match what it already writes rather than
-- forcing a rename in running code.

create type material_type as enum ('Flex', 'SAV', 'Window Graphics', 'Solite', 'Clear Stickers');

create type expense_category as enum (
  'Raw Materials',
  'SAV 3ft', 'SAV 4ft', 'SAV 5ft', 'SAV 7ft',
  'Flex 3ft', 'Flex 4ft', 'Flex 5ft', 'Flex 6ft', 'Flex 7ft', 'Flex 8ft', 'Flex 10ft',
  'Ink', 'Equipment', 'Utilities', 'Salaries', 'Transport', 'Maintenance',
  'Marketing', 'Office Supplies', 'Miscellaneous'
);
-- Kept at all 21 values. The live Expo expense form only offers 6 broad
-- buckets today (Materials & Printing, Fuel & Transport, Maintenance, Office
-- Supplies, Salaries, Miscellaneous) — that's a picker grouping several enum
-- values under one UI label, not a schema decision, so the schema keeps the
-- full granularity the old system tracked.

create type waste_reason as enum (
  'Print head calibration run',
  'Colour alignment test strip',
  'Media edge trim / setup',
  'Misprinted job — reprint needed',
  'Customer proof',
  'Roll leader / tail damage',
  'Machine jam — damaged section',
  'Other (see description)'
);

-- job_status: old JOB_STATUSES started at 'Quoted'; the live Expo
-- ProductionStage (src/utils/production-stage.ts) starts at 'Queued' and has
-- no 'Quoted' state. Kept the Expo set. `quotes` is now its own table, so a
-- row only lands in `sales` once a quote has converted (or a walk-in order is
-- entered directly) — there is nothing left for a job_status of 'Quoted' to
-- describe, and admitting it would let a `sales` row be simultaneously "just
-- a quote" and "a real order with a client_id and line items," which is the
-- exact ambiguity the quotes/sales split exists to remove.
create type job_status as enum ('Queued', 'Printing', 'Finishing', 'Ready', 'Delivered');

create type roll_status as enum ('Active', 'Low Stock', 'Out of Stock');
-- Old 'Inventory'.'Status' also had 'Depleted' as a synonym for 'Out of
-- Stock' used only by the deduction path, never the aggregate view — see
-- inventory-deduction.ts. Collapsed to one term since it's a generated value
-- here (case/threshold logic below), not something callers set by hand.

create type adjustment_kind as enum ('mov', 'delivery', 'legacy');
-- Matches BatchAdjustment.kind in src/components/records/types.ts.

create type allocation_kind as enum ('settlement', 'rounding');
