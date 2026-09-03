-- ============================================================================
-- mark_batches_paid — db.ts port, cutover slice
-- ============================================================================
-- Firebase's markBatchesPaid recorded a full payment for every selected
-- sale's outstanding balance in ONE atomic multi-path update — a partial
-- result (some sales marked paid, some not, no record of which failed or
-- why) was never possible. Looping client-side calls to record_payment
-- would give that up. Decided explicitly (supabase/README.md → "Cutover
-- plan" step 6): build the dedicated bulk RPC, not accept partial success.
--
-- One PL/pgSQL function call is one transaction (same fact create_sale's
-- bundled opening payment already relies on) — every sale in the batch is
-- processed inside that single transaction, so any failure partway through
-- (a bad sale id, a constraint violation) rolls back every payment this
-- call would otherwise have recorded, not just the one that failed.
--
-- p_payment_batch_ids is client-generated, one per sale — same
-- replay-safety shape as every other client-generated key in this schema.
-- record_payment's own ON CONFLICT (id) / (payment_batch_id, sale_id)
-- handling makes a retry of this whole call idempotent per sale, as long
-- as the retry passes the SAME ids.
--
-- Already-settled or voided sales are skipped (reported back with
-- settled = false), matching Firebase's "do not write a zero entry"
-- behavior — not an error, just nothing to do for that one.
create function public.mark_batches_paid(
  p_sale_ids uuid[],
  p_payment_batch_ids uuid[],
  p_method payment_method
) returns table (
  sale_id uuid,
  settled boolean,
  amount_paid numeric
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  i int;
  v_sale_id uuid;
  v_payment_batch_id uuid;
  v_is_voided boolean;
  v_outstanding numeric;
begin
  if p_sale_ids is null or array_length(p_sale_ids, 1) is null then
    return;
  end if;

  if array_length(p_sale_ids, 1) <> array_length(p_payment_batch_ids, 1) then
    raise exception 'p_sale_ids and p_payment_batch_ids must be the same length';
  end if;

  for i in 1..array_length(p_sale_ids, 1) loop
    v_sale_id := p_sale_ids[i];
    v_payment_batch_id := p_payment_batch_ids[i];

    select s.is_voided, coalesce(st.total_amount, 0) - coalesce(st.total_paid, 0)
      into v_is_voided, v_outstanding
    from sales s
    join sale_totals st on st.sale_id = s.id
    where s.id = v_sale_id;

    if v_is_voided is null then
      raise exception 'sale % does not exist', v_sale_id;
    end if;

    if v_is_voided or v_outstanding <= 0 then
      sale_id := v_sale_id;
      settled := false;
      amount_paid := 0;
      return next;
      continue;
    end if;

    perform public.record_payment(v_payment_batch_id, v_sale_id, v_outstanding, p_method);

    sale_id := v_sale_id;
    settled := true;
    amount_paid := v_outstanding;
    return next;
  end loop;
end;
$$;
