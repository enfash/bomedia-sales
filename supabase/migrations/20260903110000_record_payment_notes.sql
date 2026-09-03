-- ============================================================================
-- record_payment — add p_notes
-- ============================================================================
-- Gap found while wiring transaction/[id].tsx to this RPC: payment_batches
-- already has a `notes` column, but record_payment never accepted or wrote
-- it. The Firebase version's PaymentModal has always collected an optional
-- note; without this, switching the screen to record_payment would silently
-- drop whatever the operator typed. Added as a new trailing parameter with a
-- default so this remains CREATE OR REPLACE-compatible (Postgres only
-- allows that for functions when new parameters are appended with defaults,
-- not inserted or reordered).
create or replace function public.record_payment(
  p_payment_batch_id uuid,
  p_sale_id uuid,
  p_amount numeric,
  p_method payment_method,
  p_reversal_of uuid default null,
  p_reversal_reason text default null,
  p_notes text default null
) returns payment_batches
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_batch payment_batches;
begin
  if p_reversal_of is not null and coalesce(trim(p_reversal_reason), '') = '' then
    raise exception 'a reversal must state a reason';
  end if;

  insert into payment_batches (id, total_amount, method, collected_by, reversal_of, reversal_reason, notes)
  values (p_payment_batch_id, p_amount, p_method, auth.uid(), p_reversal_of, p_reversal_reason, p_notes)
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
