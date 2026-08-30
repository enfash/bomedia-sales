-- ============================================================================
-- payment_batches.collected_by_name — db.ts port, slice 5
-- ============================================================================
-- `20260830140000_sales_actor_names.sql` deferred this exact column to slice
-- 5 ("payment_batches.collected_by_name stays in slice 5") because nothing
-- read-side needed it before record_payment existed to write it. record_payment
-- landed in 20260830160000 without it — a gap, not a change of plan. Same
-- reasoning as every other actor-name snapshot in this schema
-- (expenses.logged_by_name, sales.logged_by_name/voided_by_name): a financial
-- record must keep saying who collected a payment at the time, not who
-- `profiles.name` says they're called now.
alter table payment_batches add column collected_by_name text not null default '';
alter table payment_batches alter column collected_by_name drop default;

create or replace function public.record_payment(
  p_payment_batch_id uuid,
  p_sale_id uuid,
  p_amount numeric,
  p_method payment_method,
  p_reversal_of uuid default null,
  p_reversal_reason text default null
) returns payment_batches
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch payment_batches;
  v_collected_by_name text;
begin
  if p_reversal_of is not null and coalesce(trim(p_reversal_reason), '') = '' then
    raise exception 'a reversal must state a reason';
  end if;

  select name into v_collected_by_name from profiles where id = auth.uid();

  insert into payment_batches (id, total_amount, method, collected_by, collected_by_name, reversal_of, reversal_reason)
  values (p_payment_batch_id, p_amount, p_method, auth.uid(), coalesce(v_collected_by_name, ''), p_reversal_of, p_reversal_reason)
  on conflict (id) do nothing
  returning * into v_batch;

  if v_batch is null then
    select * into v_batch from payment_batches where id = p_payment_batch_id;
  end if;

  insert into payment_allocations (payment_batch_id, sale_id, amount)
  values (p_payment_batch_id, p_sale_id, p_amount)
  on conflict (payment_batch_id, sale_id) do nothing;

  return v_batch;
end;
$$;
