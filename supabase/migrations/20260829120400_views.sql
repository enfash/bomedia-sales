-- ============================================================================
-- Views
-- ============================================================================
-- Both created with security_invoker so RLS on the underlying tables applies
-- to whoever queries the view (a staff member querying client_debt sees the
-- same rows they'd see querying sales/payment_allocations directly), rather
-- than running with the view owner's privileges.

-- ----------------------------------------------------------------------------
-- materials_valuation
-- ----------------------------------------------------------------------------
-- Old system computed this in application code (app/api/materials/route.ts)
-- because the Google Sheets API returns formula *text*, not the evaluated
-- result, for SUMIF cells — every consumer had to re-evaluate the
-- spreadsheet logic itself. A view has no such problem; it's the one
-- evaluated source every consumer reads directly.
--
-- Grouped by (material_type, width_ft) — the old sheet's synthetic
-- "Material ID" (e.g. "FLEX-3FT") was exactly that pair as a string; this
-- groups on the real columns instead of reconstructing it.
create view materials_valuation
with (security_invoker = true) as
select
  material_type,
  width_ft,
  count(*) as roll_count,
  sum(total_length_ft) as total_length_ft,
  sum(remaining_length_ft) as remaining_length_ft,
  sum(cost) as total_cost,
  sum(cost * (remaining_length_ft / nullif(total_length_ft, 0))) as remaining_asset_value,
  sum(width_ft * remaining_length_ft * price_per_sqft) as remaining_expected_revenue,
  -- An expectation, not actual sales revenue: a job's real price can differ
  -- from price_per_sqft (discounts, the minimum-order adjustment, etc). Same
  -- approximation the old sheet made ("Realised Revenue = Width * Used
  -- Length * Price per sqft").
  sum(width_ft * (total_length_ft - remaining_length_ft) * price_per_sqft) as realised_expected_revenue
from inventory_rolls
group by material_type, width_ft;

-- ----------------------------------------------------------------------------
-- client_debt
-- ----------------------------------------------------------------------------
-- Per client: what they've been billed (sale_lines totals + batch_adjustments,
-- across every non-voided sale) less what's been paid (payment_allocations,
-- both 'settlement' and 'rounding' — both are real money received, the kind
-- only distinguishes accounting purpose). Voided sales are excluded entirely,
-- matching the app's rule that a void removes a sale from every aggregate,
-- not just from view.
create view client_debt
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
    where s.is_voided = false
  ) s
  group by s.client_id
),
paid as (
  select s.client_id, sum(pa.amount) as total_paid
  from payment_allocations pa
  join sales s on s.id = pa.sale_id
  where s.is_voided = false
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
