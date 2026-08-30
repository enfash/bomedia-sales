-- ============================================================================
-- Functions & triggers
-- ============================================================================
-- Everything here exists because a plain CHECK constraint can't see other
-- rows, other tables, or the calling user — each function below states which
-- of those it needed.

-- ----------------------------------------------------------------------------
-- is_admin() — needed by RLS policies and the guard triggers below. A CHECK
-- constraint can't consult "who is running this statement"; only a function
-- backed by auth.uid() can.
-- ----------------------------------------------------------------------------
create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- ----------------------------------------------------------------------------
-- Auto-create a profile row on signup, role defaulted to 'staff' for now —
-- superseded by a later migration (20260829150000_allowed_users.sql), which
-- replaces this function to source the role from an allow-list instead of
-- always defaulting it. Left as the first version here rather than folded
-- in, so the history shows sign-up was open-to-any-authenticated-Google-
-- account before it was deliberately closed, not designed closed from the
-- start.
-- ----------------------------------------------------------------------------
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', new.email), 'staff');
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Block non-admins from changing their own (or anyone's) role.
--
-- RLS alone can't express this: a row-level policy can only allow or deny an
-- entire row's UPDATE, not "you may change this row, but only some of its
-- columns." A staff member legitimately needs to UPDATE their own profiles
-- row (e.g. their display name), so the RLS policy has to permit that
-- UPDATE — the column-level restriction on `role` specifically has to be a
-- trigger instead.
-- ----------------------------------------------------------------------------
create function public.prevent_self_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'only an admin can change profiles.role';
  end if;
  return new;
end;
$$;

create trigger profiles_role_change_guard
before update on profiles
for each row execute function public.prevent_self_role_escalation();

-- ----------------------------------------------------------------------------
-- Staff may move a sale's job_status (the Production Board) but nothing
-- else on an existing sale — docs/RBAC.md: "Edit a sale's details
-- (notes/due date) — Admin ✅, Staff ❌" and "Delete a sale — Admin ✅,
-- Staff ❌" (the void trio is this schema's version of delete). Same
-- column-level gap as above: RLS can permit or deny the UPDATE, not pick
-- which columns of it.
-- ----------------------------------------------------------------------------
create function public.sales_staff_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;

  if new.client_id is distinct from old.client_id
     or new.due_date is distinct from old.due_date
     or new.notes is distinct from old.notes
     or new.logged_by is distinct from old.logged_by
     or new.is_voided is distinct from old.is_voided
     or new.voided_at is distinct from old.voided_at
     or new.voided_by is distinct from old.voided_by
     or new.void_reason is distinct from old.void_reason
  then
    raise exception 'staff may only change job_status on an existing sale';
  end if;

  return new;
end;
$$;

create trigger sales_staff_update_guard
before update on sales
for each row execute function public.sales_staff_update_guard();

-- ----------------------------------------------------------------------------
-- payment_allocations for a batch must sum to that batch's total_amount.
--
-- A CHECK constraint sees only the row being written, never a SUM across its
-- siblings, so this has to be a trigger. It's DEFERRABLE INITIALLY DEFERRED
-- (a constraint trigger, not a plain trigger) so a client can INSERT one
-- payment_batches row and its N payment_allocations rows in a single
-- transaction — the sum is only checked at COMMIT, once every row is in,
-- rather than after each individual insert when the running sum is
-- necessarily still wrong.
-- ----------------------------------------------------------------------------
create function public.assert_payment_allocations_sum()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_batch_id uuid := coalesce(new.payment_batch_id, old.payment_batch_id);
  batch_total numeric;
  allocated numeric;
begin
  select total_amount into batch_total
  from public.payment_batches where id = target_batch_id;

  select coalesce(sum(amount), 0) into allocated
  from public.payment_allocations where payment_batch_id = target_batch_id;

  if allocated <> batch_total then
    raise exception
      'payment_allocations for batch % sum to % but payment_batches.total_amount is %',
      target_batch_id, allocated, batch_total;
  end if;

  return null;
end;
$$;

create constraint trigger payment_allocations_sum_check
after insert or update or delete on payment_allocations
deferrable initially deferred
for each row execute function public.assert_payment_allocations_sum();

-- Also guard the reverse edit: changing total_amount on an existing batch
-- without touching its allocations would otherwise slip past the trigger
-- above (nothing in payment_allocations changed).
create function public.assert_batch_total_matches_allocations()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allocated numeric;
begin
  select coalesce(sum(amount), 0) into allocated
  from public.payment_allocations where payment_batch_id = new.id;

  if allocated <> new.total_amount then
    raise exception
      'payment_batches.total_amount % does not match its allocations, which sum to %',
      new.total_amount, allocated;
  end if;

  return new;
end;
$$;

create constraint trigger payment_batches_total_check
after update of total_amount on payment_batches
deferrable initially deferred
for each row execute function public.assert_batch_total_matches_allocations();
