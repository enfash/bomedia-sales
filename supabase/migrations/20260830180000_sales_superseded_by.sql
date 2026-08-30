-- ============================================================================
-- sales.superseded_by_sale_id — for the deferred Sheets line-item backfill
-- ============================================================================
-- NOT used by the opening-balance middle-path import (see
-- docs/sheets-import-brief.md and the cutover plan in supabase/README.md).
-- That import only ever creates opening-balance sales; nothing it does needs
-- this column. Added now, ahead of when it's needed, because the reasoning
-- for it — worked out alongside the middle-path design — shouldn't have to
-- be reconstructed months from now when the full historical backfill
-- actually happens, and a schema change landing correctly at that point
-- shouldn't be a dependency of that later work.
--
-- THE PROBLEM THIS SOLVES. The middle path creates one permanent
-- opening-balance `sales` row per client, carrying the shortfall that
-- existed at cutover — deliberately never voided or rewritten. When the
-- full backfill eventually imports the real historical sales that made up
-- that shortfall, with their real (possibly partial) historical payments
-- attached, `client_debt` would sum both the opening-balance row AND the
-- real historical sales it stood in for — double-counting the exact gap
-- the opening balance exists to represent, once as itself and once via
-- whichever historical sales were still open at cutover.
--
-- THE FIX. A historical sale that had a genuine shortfall at cutover gets
-- `superseded_by_sale_id` set to that client's opening-balance sale, once,
-- at import time — never edited afterward. The sale itself keeps its true
-- historical billed/paid amounts forever, correct for anyone looking up
-- that specific order (invoice reprint, transaction detail). It is only
-- excluded from `client_debt`'s CLIENT-LEVEL aggregate, because its net
-- effect is already counted once, permanently, by the opening-balance row.
-- A historical sale that was already fully paid before cutover needs no
-- flag at all — billed equals paid, so it already contributes zero.
--
-- Not enforced here: that the referenced sale is actually an opening-balance
-- sale (would need a trigger, since a CHECK constraint can't inspect another
-- row). Left as documented intent, matching how this schema generally
-- prefers a documented invariant over a triggered one where the write path
-- is a single, careful, one-time import script rather than live app code.
alter table sales add column superseded_by_sale_id uuid references sales (id);

alter table sales add constraint sales_not_self_superseded
  check (superseded_by_sale_id is null or superseded_by_sale_id <> id);

create index sales_superseded_by_sale_id_idx on sales (superseded_by_sale_id)
  where superseded_by_sale_id is not null;

-- client_debt, amended: both the billed and paid sums now exclude a
-- superseded sale — excluding it from only one side would over- or
-- under-count the client's balance by exactly its historical amount.
create or replace view client_debt
with (security_invoker = true) as
with billed as (
  select s.client_id, sum(s.line_total + s.adjustment_total) as total_billed
  from (
    select
      s.id,
      s.client_id,
      coalesce((select sum(sl.total) from sale_lines sl where sl.sale_id = s.id), 0) as line_total,
      coalesce((select sum(ba.amount) from batch_adjustments ba where ba.sale_id = s.id), 0) as adjustment_total
    from sales s
    where s.is_voided = false and s.superseded_by_sale_id is null
  ) s
  group by s.client_id
),
paid as (
  select s.client_id, sum(pa.amount) as total_paid
  from payment_allocations pa
  join sales s on s.id = pa.sale_id
  where s.is_voided = false and s.superseded_by_sale_id is null
  group by s.client_id
)
select
  c.id as client_id,
  c.name,
  coalesce(billed.total_billed, 0) as total_billed,
  coalesce(paid.total_paid, 0) as total_paid,
  coalesce(billed.total_billed, 0) - coalesce(paid.total_paid, 0) as balance
from clients c
left join billed on billed.client_id = c.id
left join paid on paid.client_id = c.id;
