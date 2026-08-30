-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Modelled directly on docs/RBAC.md, which is explicit that most reads stay
-- open to any authenticated user by design ("If a hard wall is ever needed,
-- the sales data model would have to change... rules can restrict reads
-- without breaking the client-side aggregations" — Clients/Production
-- Board/debt all aggregate across every sale, and staff need that). Where
-- the doc names an Admin-only capability, the policy enforces it; everywhere
-- else, both roles get the same row-level access and the app's UI filters
-- (Records "today only", Expenses "own + today") stay UI-level, unchanged.
--
-- No RLS policy here can restrict which *columns* a role may write within a
-- row it's otherwise allowed to UPDATE — that gap ("staff can move
-- job_status but not edit notes/due_date", "no one but an admin can change
-- profiles.role") is closed by the guard triggers in the previous migration,
-- not by the policies below.
--
-- This app is internal-only — every capability requires being signed in, so
-- `anon` is granted nothing here, intentionally.

grant usage on schema public to authenticated;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
alter table profiles enable row level security;

create policy "profiles_select" on profiles
  for select to authenticated using (true);

create policy "profiles_update_own" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());
-- Role changes within this UPDATE are blocked by profiles_role_change_guard,
-- not by this policy. No insert/delete policy: rows are created only by the
-- on_auth_user_created trigger (SECURITY DEFINER, runs as table owner).

-- ----------------------------------------------------------------------------
-- clients
-- ----------------------------------------------------------------------------
alter table clients enable row level security;

create policy "clients_select" on clients
  for select to authenticated using (true);

create policy "clients_insert" on clients
  for insert to authenticated with check (true);
-- Both roles add a new client while logging a sale.

create policy "clients_update" on clients
  for update to authenticated using (is_admin()) with check (is_admin());

create policy "clients_delete" on clients
  for delete to authenticated using (is_admin());
-- Renaming/merging an existing client is data-hygiene, not order-taking —
-- treated like "edit a sale's details" (RBAC.md: Admin ✅, Staff ❌).

-- ----------------------------------------------------------------------------
-- sales
-- ----------------------------------------------------------------------------
alter table sales enable row level security;

create policy "sales_select" on sales
  for select to authenticated using (true);
-- RBAC.md is explicit the raw read stays open; "today only" for staff is a
-- UI filter in useRecords, not a rules-level restriction.

create policy "sales_insert" on sales
  for insert to authenticated with check (logged_by = auth.uid());

create policy "sales_update" on sales
  for update to authenticated using (true) with check (true);
-- Deliberately permissive here — both roles must be able to UPDATE (staff to
-- move job_status on the Production Board). sales_staff_update_guard is what
-- actually stops staff from touching notes/due_date/void fields.

create policy "sales_delete" on sales
  for delete to authenticated using (is_admin());
-- RBAC.md: "Delete a sale — Admin ✅, Staff ❌."

-- ----------------------------------------------------------------------------
-- sale_lines
-- ----------------------------------------------------------------------------
alter table sale_lines enable row level security;

create policy "sale_lines_select" on sale_lines
  for select to authenticated using (true);

create policy "sale_lines_insert" on sale_lines
  for insert to authenticated with check (true);
-- Written together with the parent sale by whoever is logging it.

create policy "sale_lines_update" on sale_lines
  for update to authenticated using (is_admin()) with check (is_admin());

create policy "sale_lines_delete" on sale_lines
  for delete to authenticated using (is_admin());
-- Changing a job's dimensions/material/price after the fact is "editing a
-- sale's details" — RBAC.md: Admin ✅, Staff ❌.

-- ----------------------------------------------------------------------------
-- batch_adjustments
-- ----------------------------------------------------------------------------
alter table batch_adjustments enable row level security;

create policy "batch_adjustments_select" on batch_adjustments
  for select to authenticated using (true);

create policy "batch_adjustments_insert" on batch_adjustments
  for insert to authenticated with check (true);
-- MOV/delivery adjustments are computed and written at sale-creation time by
-- whoever is logging the sale.

create policy "batch_adjustments_update" on batch_adjustments
  for update to authenticated using (is_admin()) with check (is_admin());

create policy "batch_adjustments_delete" on batch_adjustments
  for delete to authenticated using (is_admin());

-- ----------------------------------------------------------------------------
-- payment_batches / payment_allocations
-- ----------------------------------------------------------------------------
alter table payment_batches enable row level security;
alter table payment_allocations enable row level security;

create policy "payment_batches_select" on payment_batches
  for select to authenticated using (true);

create policy "payment_batches_insert" on payment_batches
  for insert to authenticated with check (collected_by = auth.uid());
-- RBAC.md: "Record a payment / collect debt — Admin ✅, Staff ✅."

create policy "payment_batches_update" on payment_batches
  for update to authenticated using (is_admin()) with check (is_admin());
-- No delete policy for either role — a mis-entered payment is corrected with
-- a reversal batch (negative total_amount/allocations), not an edit or a
-- delete. That mirrors the existing Firebase ledger, which is append-only by
-- design (see docs/DATABASE_RUNBOOK.md).

create policy "payment_allocations_select" on payment_allocations
  for select to authenticated using (true);

create policy "payment_allocations_insert" on payment_allocations
  for insert to authenticated with check (true);
-- Inserted in the same transaction as its parent payment_batches row, by the
-- same actor payment_batches_insert already constrained.
-- No update/delete policy: same append-only reasoning as payment_batches.

-- ----------------------------------------------------------------------------
-- expenses
-- ----------------------------------------------------------------------------
alter table expenses enable row level security;

create policy "expenses_select" on expenses
  for select to authenticated using (true);
-- RBAC.md: "own, sees only today" for staff is a UI filter (expenses.tsx),
-- not a rules-level restriction — "the whole expenses tree is readable by
-- any authed user."

create policy "expenses_insert" on expenses
  for insert to authenticated with check (logged_by = auth.uid());
-- RBAC.md: "Staff-created expenses must carry uid === auth.uid (enforced by
-- rules)."

create policy "expenses_update" on expenses
  for update to authenticated using (is_admin()) with check (is_admin());

create policy "expenses_delete" on expenses
  for delete to authenticated using (is_admin());

-- ----------------------------------------------------------------------------
-- inventory_rolls
-- ----------------------------------------------------------------------------
alter table inventory_rolls enable row level security;

create policy "inventory_rolls_select" on inventory_rolls
  for select to authenticated using (true);
-- Staff need to see available stock while taking an order.

create policy "inventory_rolls_insert" on inventory_rolls
  for insert to authenticated with check (is_admin());

create policy "inventory_rolls_update" on inventory_rolls
  for update to authenticated using (is_admin()) with check (is_admin());

create policy "inventory_rolls_delete" on inventory_rolls
  for delete to authenticated using (is_admin());
-- RBAC.md: "Settings (materials / pricing / printers) — Admin ✅, Staff ❌."
-- Rolls are inventory/pricing settings in this schema.

-- ----------------------------------------------------------------------------
-- waste_log
-- ----------------------------------------------------------------------------
alter table waste_log enable row level security;

create policy "waste_log_select" on waste_log
  for select to authenticated using (true);

create policy "waste_log_insert" on waste_log
  for insert to authenticated with check (logged_by = auth.uid());
-- No update/delete policy — append-only, same reasoning as the payment
-- ledger: a bad entry gets a correcting entry, not an edit.

-- ----------------------------------------------------------------------------
-- quotes / quote_lines
-- ----------------------------------------------------------------------------
-- RBAC.md predates quotes as a table, so there's no rule to translate
-- directly. Treated like a sale (both roles create), but editing/deleting is
-- restricted to the quote's own author or an admin — a judgment call, not
-- something the doc specifies.
alter table quotes enable row level security;
alter table quote_lines enable row level security;

create policy "quotes_select" on quotes
  for select to authenticated using (true);

create policy "quotes_insert" on quotes
  for insert to authenticated with check (created_by = auth.uid());

create policy "quotes_update" on quotes
  for update to authenticated
  using (is_admin() or created_by = auth.uid())
  with check (is_admin() or created_by = auth.uid());

create policy "quotes_delete" on quotes
  for delete to authenticated using (is_admin() or created_by = auth.uid());

create policy "quote_lines_select" on quote_lines
  for select to authenticated using (true);

create policy "quote_lines_insert" on quote_lines
  for insert to authenticated with check (true);
-- Written together with the parent quote by whoever quotes_insert already
-- constrained to be its author.

create policy "quote_lines_update" on quote_lines
  for update to authenticated using (
    exists (
      select 1 from quotes q
      where q.quote_id = quote_lines.quote_id
        and (is_admin() or q.created_by = auth.uid())
    )
  );

create policy "quote_lines_delete" on quote_lines
  for delete to authenticated using (
    exists (
      select 1 from quotes q
      where q.quote_id = quote_lines.quote_id
        and (is_admin() or q.created_by = auth.uid())
    )
  );

-- ----------------------------------------------------------------------------
-- Table-level grants
-- ----------------------------------------------------------------------------
-- RLS policies only ever narrow access — Postgres checks table-level
-- privilege first, and `authenticated`/`anon` have none on a newly created
-- table by default. Without these grants every policy above is unreachable
-- and every query fails with "permission denied for table ..." regardless of
-- what the policy would have allowed.
grant select, insert, update, delete on all tables in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
