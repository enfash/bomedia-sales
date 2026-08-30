-- ============================================================================
-- create_sale / record_payment — db.ts port, slice 5
-- ============================================================================
-- Both SECURITY INVOKER: every insert either function performs already has
-- a permissive RLS policy for the calling user (sales_insert,
-- sale_lines_insert, batch_adjustments_insert, payment_batches_insert,
-- payment_allocations_insert — all checked before this migration was
-- written). Neither function re-implements permission logic; both inherit
-- whatever RLS already says. The one privileged step — inventory deduction
-- touching inventory_rolls/sale_line_consumption, which staff can't write
-- directly — is already isolated in deduct_for_sale_line(), its own
-- SECURITY DEFINER trigger. Nothing here needs elevated privilege.

-- ----------------------------------------------------------------------------
-- Gap found while implementing, not in the approved design note:
-- payment_batches had nowhere to record a reversal's target or reason.
-- StoredPayment (the Firebase shape this replaces) carried reversalOf/
-- reversalReason as first-class fields, and reversePayment (the code being
-- replaced) makes the reason mandatory. Without these columns a reversal's
-- "why" would be silently lost. Adding them is what makes record_payment's
-- reversal path (below) actually complete rather than a stub.
-- ----------------------------------------------------------------------------
alter table payment_batches add column reversal_of uuid references payment_batches (id);
alter table payment_batches add column reversal_reason text;
alter table payment_batches add constraint payment_batches_reversal_consistent check (
  (reversal_of is null and reversal_reason is null)
  or
  (reversal_of is not null and reversal_reason is not null)
);

-- ----------------------------------------------------------------------------
-- record_payment
-- ----------------------------------------------------------------------------
-- Client-generated key: p_payment_batch_id, enforced by payment_batches'
-- own primary key. Replay-safe by construction:
--
--   1. Insert the batch, ON CONFLICT (id) DO NOTHING. If it already existed,
--      re-select it rather than erroring — a replay of an already-landed
--      write is success, not failure (see the design note's three-outcome
--      table).
--   2. ALWAYS attempt the allocation insert, ON CONFLICT
--      (payment_batch_id, sale_id) DO NOTHING — never skipped based on
--      whether step 1 found a conflict.
--
-- Step 2 deliberately does not branch on step 1's outcome. The first draft
-- of this function did — "batch already existed, so skip re-inserting the
-- allocation" — which only holds for batches THIS function created. A batch
-- row written by the Sheets import, or by hand as an admin correction, has
-- no such guarantee: the batch could exist with no matching allocation at
-- all. Verifying via the unique constraint, rather than assuming from how
-- the batch got there, is what makes this correct regardless of who wrote
-- the batch.
create function public.record_payment(
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
begin
  if p_reversal_of is not null and coalesce(trim(p_reversal_reason), '') = '' then
    raise exception 'a reversal must state a reason';
  end if;

  insert into payment_batches (id, total_amount, method, collected_by, reversal_of, reversal_reason)
  values (p_payment_batch_id, p_amount, p_method, auth.uid(), p_reversal_of, p_reversal_reason)
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

-- ----------------------------------------------------------------------------
-- create_sale
-- ----------------------------------------------------------------------------
-- Client-generated key: p_receipt_number, enforced by sales.receipt_number's
-- unique constraint. Same landed-vs-replay handling as record_payment for
-- the sales row itself — but NOT the same handling for its lines/
-- adjustments, and that asymmetry is deliberate, not an oversight:
--
-- payment_allocations now has a natural idempotency key
-- (payment_batch_id, sale_id), so "always attempt the insert, let the
-- constraint dedupe" is both safe and correct there. sale_lines and
-- batch_adjustments have no equivalent — a sale can legitimately hold two
-- identical line items, so there is no column combination that could be
-- UNIQUE without also rejecting real orders. "Always attempt" would
-- therefore duplicate every line on a genuine replay, which is worse than
-- what this does instead: on conflict, return the existing sale and insert
-- nothing further.
--
-- This IS still sound, not merely convenient, because of how Postgres
-- transactions work: every insert below runs in the one transaction this
-- function call is. A sales row cannot become visible to a later query
-- unless that same transaction also committed its lines, adjustments, and
-- opening payment — there is no partial-commit state for a later caller to
-- observe. The only residual risk is an EXTERNAL write reusing the same
-- receipt_number for something else entirely (the Sheets import, an admin
-- correction) — architecturally possible, not fixable by a stronger
-- idempotency mechanism given line items have no natural key, and not the
-- failure mode this function's own replay safety is protecting against
-- (that's a genuine client retry resending the exact same journalled call,
-- which this handles correctly).
create function public.create_sale(
  p_receipt_number text,
  p_client_id uuid,
  p_lines jsonb,
  p_adjustments jsonb default '[]'::jsonb,
  p_notes text default null,
  p_due_date date default null,
  p_opening_payment jsonb default null  -- {payment_batch_id, amount, method} or null
) returns sales
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sale sales;
  v_line jsonb;
  v_adjustment jsonb;
  v_logged_by_name text;
begin
  select name into v_logged_by_name from profiles where id = auth.uid();

  insert into sales (receipt_number, client_id, logged_by, logged_by_name, notes, due_date)
  values (p_receipt_number, p_client_id, auth.uid(), coalesce(v_logged_by_name, ''), p_notes, p_due_date)
  on conflict (receipt_number) do nothing
  returning * into v_sale;

  if v_sale is null then
    select * into v_sale from sales where receipt_number = p_receipt_number;
    return v_sale;
  end if;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    insert into sale_lines (
      sale_id, job_name, material_type, width_ft, height_ft, job_unit,
      quantity, unit_price, total, eyelets, lamination, turnaround_time
    ) values (
      v_sale.id,
      v_line ->> 'job_name',
      (v_line ->> 'material_type')::material_type,
      (v_line ->> 'width_ft')::numeric,
      (v_line ->> 'height_ft')::numeric,
      v_line ->> 'job_unit',
      (v_line ->> 'quantity')::integer,
      (v_line ->> 'unit_price')::numeric,
      (v_line ->> 'total')::numeric,
      coalesce((v_line ->> 'eyelets')::boolean, false),
      coalesce((v_line ->> 'lamination')::boolean, false),
      v_line ->> 'turnaround_time'
    );
  end loop;

  for v_adjustment in select * from jsonb_array_elements(p_adjustments)
  loop
    insert into batch_adjustments (sale_id, kind, label, amount)
    values (
      v_sale.id,
      (v_adjustment ->> 'kind')::adjustment_kind,
      v_adjustment ->> 'label',
      (v_adjustment ->> 'amount')::numeric
    );
  end loop;

  if p_opening_payment is not null then
    -- Bundled deliberately, not split into a second client call: splitting
    -- would reopen the exact silent-loss window this whole offline-queue
    -- design exists to close (sale lands, payment call never happens).
    -- Consequence, not a bug: if a line's stock check fails here (once real
    -- inventory exists — see supabase/README.md's "Known follow-ups"), the
    -- opening payment rolls back too, along with the rest of the sale.
    perform public.record_payment(
      (p_opening_payment ->> 'payment_batch_id')::uuid,
      v_sale.id,
      (p_opening_payment ->> 'amount')::numeric,
      (p_opening_payment ->> 'method')::payment_method
    );
  end if;

  return v_sale;
end;
$$;
