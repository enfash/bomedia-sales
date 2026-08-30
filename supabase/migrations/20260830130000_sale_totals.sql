-- ============================================================================
-- sale_totals — db.ts port, slice 4
-- ============================================================================
-- client_debt (built with the original schema) aggregates billed/paid PER
-- CLIENT — right for a debt summary, but this app's actual screens (Records,
-- transaction detail, invoice) are sale-centric: they show one sale's own
-- totalPaid/totalBalance/status, not a client's aggregate across every sale.
-- No per-sale equivalent existed before this. Same structure as client_debt
-- — sale_lines + batch_adjustments summed as "billed", payment_allocations
-- summed as "paid" — just grouped by sale instead of by client.
--
-- Unlike client_debt, this does NOT exclude voided sales: client_debt drops
-- them because a voided sale shouldn't count toward a client's outstanding
-- balance, but this is one row per sale, not an aggregate across sales — a
-- voided sale still needs its own totals (the transaction detail screen and
-- the invoice both still render a voided sale, stamped accordingly).
create view sale_totals
with (security_invoker = true) as
select
  s.id as sale_id,
  coalesce(sl.line_total, 0) + coalesce(ba.adjustment_total, 0) as total_amount,
  coalesce(pa.paid_total, 0) as total_paid
from sales s
left join (
  select sale_id, sum(total) as line_total from sale_lines group by sale_id
) sl on sl.sale_id = s.id
left join (
  select sale_id, sum(amount) as adjustment_total from batch_adjustments group by sale_id
) ba on ba.sale_id = s.id
left join (
  select sale_id, sum(amount) as paid_total from payment_allocations group by sale_id
) pa on pa.sale_id = s.id;
