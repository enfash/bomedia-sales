-- ============================================================================
-- Tables
-- ============================================================================

-- ----------------------------------------------------------------------------
-- profiles — extends auth.users. Not explicitly asked for, but RLS (asked
-- for in this migration set) needs somewhere to read a user's role from, and
-- auth.users itself isn't safely readable/filterable from policies. This is
-- the direct replacement for the old plaintext-passcode `cashiers` table:
-- role lives here, authentication lives in Supabase Auth.
-- ----------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  role user_role not null default 'staff',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- clients
-- ----------------------------------------------------------------------------
-- Replaces free-text client names on every sale (old lib/client-names.ts),
-- which produced duplicate customers differing only by case or whitespace
-- ("Ola" vs "ola" vs "Ola "), silently splitting one customer's debt across
-- two rows.
--
-- The old fix was runtime-only: on every write, re-derive the "dominant"
-- spelling by voting across every historical sale row for that customer
-- (canonicalClientName). That vote only existed because there was no real
-- table to enforce uniqueness against. With `name_key` unique below, the
-- vote becomes unnecessary going forward — whatever spelling wins on first
-- insert becomes canonical, and every later sale reuses the same client_id,
-- so the duplication the old logic compensated for cannot recur. The
-- frequency-vote heuristic is still needed exactly once, to pick each
-- customer's initial spelling when backfilling the historical sales export —
-- that's a one-time migration script, not schema.
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text generated always as (
    lower(regexp_replace(trim(both from name), '\s+', ' ', 'g'))
  ) stored,
  contact text,
  created_at timestamptz not null default now()
);

create unique index clients_name_key_uniq on clients (name_key);

-- ----------------------------------------------------------------------------
-- sales — the batch. Matches SalesBatch in
-- src/components/records/types.ts: a sale is a client, a moment in time, and
-- a production/void lifecycle. Line items live in sale_lines below —
-- dimensions do NOT belong here.
-- ----------------------------------------------------------------------------
create table sales (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id),
  created_at timestamptz not null default now(),
  job_status job_status not null default 'Queued',
  due_date date,
  logged_by uuid not null references auth.users (id),
  notes text,
  is_voided boolean not null default false,
  voided_at timestamptz,
  voided_by uuid references auth.users (id),
  void_reason text,
  constraint sales_void_fields_consistent check (
    (is_voided = false and voided_at is null and voided_by is null and void_reason is null)
    or
    (is_voided = true and voided_at is not null and voided_by is not null and void_reason is not null)
  )
);

create index sales_client_id_idx on sales (client_id);

-- ----------------------------------------------------------------------------
-- sale_lines — the item. Matches SalesRecord/StoredItem in
-- src/components/records/types.ts. Dimensions live here, per job, not on the
-- batch — one sale can carry several jobs of different sizes and materials.
-- ----------------------------------------------------------------------------
create table sale_lines (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales (id) on delete cascade,
  job_name text,
  material_type material_type not null,
  -- job_unit records what the operator actually typed (inches are common for
  -- small jobs); width_ft/height_ft always hold the converted-to-feet value,
  -- so every downstream computation (sqft, inventory deduction) has one
  -- canonical unit. job_unit is kept only so the receipt can still show
  -- "6in x 8in" instead of "0.5ft x 0.67ft".
  job_unit text not null default 'ft' check (job_unit in ('in', 'ft')),
  width_ft numeric(8, 2) not null check (width_ft > 0),
  height_ft numeric(8, 2) not null check (height_ft > 0),
  sqft numeric(10, 2) generated always as (width_ft * height_ft) stored,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  -- Stored, not generated: a line's total can be negotiated independently of
  -- quantity × unit_price (bulk discount, rounding, a price agreed before the
  -- catalog rate changed). sqft is pure geometry with no such negotiation, so
  -- it's safe to compute; total is the authoritative snapshot of what was
  -- actually charged and stays a plain column.
  total numeric(12, 2) not null check (total >= 0),
  eyelets boolean not null default false,
  lamination boolean not null default false,
  -- A closed set matching the Expo type ('Standard'|'Rush'|'Same Day'), but
  -- kept as a CHECK rather than its own enum — one more type felt like
  -- unnecessary sprawl for a single per-line attribute this narrow.
  turnaround_time text check (turnaround_time in ('Standard', 'Rush', 'Same Day'))
);

create index sale_lines_sale_id_idx on sale_lines (sale_id);

-- ----------------------------------------------------------------------------
-- batch_adjustments
-- ----------------------------------------------------------------------------
-- Matches BatchAdjustment in src/components/records/types.ts: minimum-order
-- top-ups, delivery cost, and legacy migrated deltas, each an immutable
-- snapshot at the amount agreed, kept separate from the line items they
-- adjust.
create table batch_adjustments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales (id) on delete cascade,
  kind adjustment_kind not null,
  label text not null,
  amount numeric(12, 2) not null check (amount <> 0),
  created_at timestamptz not null default now()
);

create index batch_adjustments_sale_id_idx on batch_adjustments (sale_id);

-- ----------------------------------------------------------------------------
-- payment_batches / payment_allocations
-- ----------------------------------------------------------------------------
-- A payment_batch is one payment event (one lump sum collected). Its
-- allocations are how that sum is applied — usually to a single sale, but
-- the old app's lump-sum distribution flow (lib/store.ts, the
-- 'payment_batch' queue entry) could spread one payment across several
-- outstanding sales for the same client, which is exactly what a batch of
-- several allocation rows models directly instead of as an ad-hoc "steps"
-- array. amount is allowed to be negative so a reversal is just another
-- batch (with negative total and negative allocations) rather than a
-- separate mechanism — mirrors "amount (negative only on reversal)" on the
-- existing PaymentEntry ledger.
create table payment_batches (
  id uuid primary key default gen_random_uuid(),
  total_amount numeric(12, 2) not null check (total_amount <> 0),
  method payment_method not null,
  collected_by uuid not null references auth.users (id),
  received_at timestamptz not null default now(),
  notes text
);

create table payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_batch_id uuid not null references payment_batches (id) on delete cascade,
  sale_id uuid not null references sales (id),
  kind allocation_kind not null default 'settlement',
  amount numeric(12, 2) not null check (amount <> 0),
  created_at timestamptz not null default now()
);
-- The "allocations for a batch sum to that batch's total_amount" invariant
-- can't be a CHECK constraint — CHECK only ever sees one row, and this needs
-- an aggregate across every allocation for the batch. That's implemented as
-- a deferred constraint trigger in the next migration, once both tables
-- exist.

create index payment_allocations_batch_id_idx on payment_allocations (payment_batch_id);
create index payment_allocations_sale_id_idx on payment_allocations (sale_id);

-- ----------------------------------------------------------------------------
-- expenses
-- ----------------------------------------------------------------------------
-- Not called out in the corrections, but expense_category has nowhere to
-- live without it, and the old system's route (app/api/expenses/route.ts)
-- and the live Expo hook (src/hooks/use-expenses.ts) agree on this shape.
create table expenses (
  id uuid primary key default gen_random_uuid(),
  category expense_category not null,
  amount numeric(12, 2) not null check (amount > 0),
  description text,
  logged_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- inventory_rolls
-- ----------------------------------------------------------------------------
-- Reconciled against the old app's app/api/inventory/route.ts
-- INVENTORY_HEADERS ('Roll ID', 'Item Name', 'Category', 'Width (ft)',
-- 'Raw Length (ft)', 'Total Length (ft)', 'Remaining Length (ft)', 'Waste
-- Logged (ft)', 'Unit', 'Price', 'Cost', 'Waste Factor', 'Cost per Sqft',
-- 'Low Stock Threshold (ft)', 'Status', 'Date Added', 'Material ID',
-- 'Expected Revenue', 'Remaining Asset Value', 'Remaining Expected Revenue').
--
-- Dropped from that list:
--   'Unit'  — always feet everywhere else in this schema; a constant column
--             carries no information.
--   'Waste Logged (ft)' — that was a running total with the reason
--             discarded; `waste_log` (below) is the detailed replacement,
--             and the total is `sum(length_ft)` over it, not a column here.
--   'Material ID' — a synthetic string like "FLEX-3FT" that just meant
--             "this material_type at this width". material_type + width_ft
--             already identify that; materials_valuation groups by both
--             instead of reconstructing the string.
--   'Cost per Sqft', 'Status', 'Expected Revenue', 'Remaining Asset Value',
--   'Remaining Expected Revenue' — all pure functions of this row's own
--             cost/width/length columns (or, for the last three, need
--             cross-roll aggregation). Per the no-stored-derived-values rule,
--             none of these are plain stored columns. cost_per_sqft and
--             status are GENERATED — safe to store because Postgres
--             recomputes them on every write, so they can't go stale the way
--             the old Sheets-formula mirror in JS could. The three
--             revenue/asset figures need aggregation across rolls, so they
--             live only in the materials_valuation view.
create table inventory_rolls (
  id uuid primary key default gen_random_uuid(),
  roll_code text not null unique,
  item_name text not null,
  category text,
  material_type material_type not null,
  width_ft numeric(8, 2) not null check (width_ft > 0),
  raw_length_ft numeric(10, 2) not null check (raw_length_ft > 0),
  total_length_ft numeric(10, 2) not null check (total_length_ft > 0 and total_length_ft <= raw_length_ft),
  remaining_length_ft numeric(10, 2) not null check (remaining_length_ft >= 0 and remaining_length_ft <= total_length_ft),
  cost numeric(12, 2) not null check (cost >= 0),
  price_per_sqft numeric(12, 2) not null check (price_per_sqft >= 0),
  waste_factor numeric(6, 2),
  low_stock_threshold_ft numeric(8, 2) not null default 20 check (low_stock_threshold_ft >= 0),
  cost_per_sqft numeric(12, 2) generated always as (
    cost / nullif(width_ft * total_length_ft, 0)
  ) stored,
  status roll_status generated always as (
    case
      when remaining_length_ft <= 0 then 'Out of Stock'::roll_status
      when remaining_length_ft <= low_stock_threshold_ft then 'Low Stock'::roll_status
      else 'Active'::roll_status
    end
  ) stored,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- waste_log
-- ----------------------------------------------------------------------------
create table waste_log (
  id uuid primary key default gen_random_uuid(),
  roll_id uuid not null references inventory_rolls (id),
  length_ft numeric(8, 2) not null check (length_ft > 0),
  reason waste_reason not null,
  logged_by uuid not null references auth.users (id),
  logged_at timestamptz not null default now()
);

create index waste_log_roll_id_idx on waste_log (roll_id);

-- ----------------------------------------------------------------------------
-- quotes / quote_lines
-- ----------------------------------------------------------------------------
create table quotes (
  quote_id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create table quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references quotes (quote_id) on delete cascade,
  material_type material_type not null,
  width_ft numeric(8, 2) not null check (width_ft > 0),
  height_ft numeric(8, 2) not null check (height_ft > 0),
  sqft numeric(10, 2) generated always as (width_ft * height_ft) stored,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0)
);

create index quote_lines_quote_id_idx on quote_lines (quote_id);
