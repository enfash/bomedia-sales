-- ============================================================================
-- Inventory deduction — the gap flagged in the previous pass
-- ============================================================================
-- Ports the FIFO cascade from the old app's lib/inventory-deduction.ts
-- (bomedia-sales-snput): a job draws from the oldest roll of its material
-- first, and spills the remainder onto the next roll when the active one
-- runs out. Single-roll consumption within that cascade is computed by the
-- nesting calculation ported into deduct_for_sale_line() (see the later
-- migration that revises this function): items-per-row in each orientation,
-- ceil(quantity / itemsPerRow) rows, the shorter orientation wins. What is
-- deliberately NOT here is the old app's cross-job layout optimiser —
-- arranging *different* jobs together on one roll to share partial rows.
-- That belongs where a person can see and adjust the cut plan, not in a
-- trigger nobody will ever look at.
--
-- One other deliberate departure from the old app: it logged a warning and
-- let an under-stocked order through silently. Per this pass's brief, that
-- was a hard failure here instead — the whole transaction rejected rather
-- than letting remaining_length_ft go negative — for a material that has
-- rolls but not enough of them. A later migration (20260830120000) revises
-- this for materials with NO rolls at all: since this app has never tracked
-- stock for anything, that raise was rejecting every sale, not just
-- understocked ones — see that migration for what changed and why.
--
-- Every deduction is recorded in sale_line_consumption so it can be reversed
-- exactly — without that ledger, "which roll(s) did this line draw from"
-- isn't recoverable once a cascade has spread a line across more than one
-- roll, and reversal (line deleted, line edited, sale voided) would have
-- nothing reliable to undo.

create table sale_line_consumption (
  id uuid primary key default gen_random_uuid(),
  sale_line_id uuid not null references sale_lines (id) on delete cascade,
  roll_id uuid not null references inventory_rolls (id),
  length_ft numeric(10, 2) not null check (length_ft > 0),
  created_at timestamptz not null default now()
);

create index sale_line_consumption_sale_line_id_idx on sale_line_consumption (sale_line_id);
create index sale_line_consumption_roll_id_idx on sale_line_consumption (roll_id);

-- ----------------------------------------------------------------------------
-- deduct_for_sale_line — cascades one line's consumption across rolls of its
-- material, FIFO (oldest roll first), recording exactly what was taken from
-- each roll touched.
-- ----------------------------------------------------------------------------
create function public.deduct_for_sale_line(p_line sale_lines)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_voided boolean;
  v_consume_length numeric;
  v_remaining_to_deduct numeric;
  v_roll record;
  v_take numeric;
begin
  select is_voided into v_is_voided from sales where id = p_line.sale_id;
  if v_is_voided then
    -- A line added to an already-voided sale never happened, stock-wise.
    return;
  end if;

  for v_roll in
    select id, remaining_length_ft, width_ft
    from inventory_rolls
    where material_type = p_line.material_type and remaining_length_ft > 0
    order by created_at, id
    for update
  loop
    if v_remaining_to_deduct is null then
      -- Orientation is decided once, against the FIFO-first roll with stock
      -- — exactly what the old app did (nest against the active/selected
      -- roll, then drain that one length across however many rolls the
      -- cascade needs). A later, wider roll in the cascade is never used to
      -- rescue a job that doesn't fit the first one.
      if p_line.width_ft <= v_roll.width_ft then
        v_consume_length := p_line.height_ft * p_line.quantity;
      elsif p_line.height_ft <= v_roll.width_ft then
        v_consume_length := p_line.width_ft * p_line.quantity;
      else
        raise exception 'job %ft x %ft exceeds the widest available % roll (%ft)',
          p_line.width_ft, p_line.height_ft, p_line.material_type, v_roll.width_ft;
      end if;
      v_remaining_to_deduct := v_consume_length;
    end if;

    exit when v_remaining_to_deduct <= 0;

    v_take := least(v_roll.remaining_length_ft, v_remaining_to_deduct);

    update inventory_rolls
      set remaining_length_ft = remaining_length_ft - v_take
      where id = v_roll.id;

    insert into sale_line_consumption (sale_line_id, roll_id, length_ft)
      values (p_line.id, v_roll.id, v_take);

    v_remaining_to_deduct := v_remaining_to_deduct - v_take;
  end loop;

  if v_remaining_to_deduct is null then
    raise exception 'no stock available for material %', p_line.material_type;
  end if;

  if v_remaining_to_deduct > 0 then
    raise exception 'insufficient % stock: %ft short of what this line needs across all rolls',
      p_line.material_type, round(v_remaining_to_deduct, 2);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- reverse_sale_line_consumption — credits every roll a line drew from back
-- the exact amount taken, and clears the ledger for that line. Used for
-- DELETE, for UPDATE (reverse-then-rededuct, since a diff against the old
-- dimensions/material isn't meaningfully simpler than redoing the cascade),
-- and for voiding a sale.
-- ----------------------------------------------------------------------------
create function public.reverse_sale_line_consumption(p_sale_line_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
begin
  for rec in
    select roll_id, sum(length_ft) as length_ft
    from sale_line_consumption
    where sale_line_id = p_sale_line_id
    group by roll_id
  loop
    update inventory_rolls
      set remaining_length_ft = remaining_length_ft + rec.length_ft
      where id = rec.roll_id;
  end loop;

  delete from sale_line_consumption where sale_line_id = p_sale_line_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- sale_lines triggers
-- ----------------------------------------------------------------------------
create function public.sale_lines_deduct_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.deduct_for_sale_line(new);
  return new;
end;
$$;

create trigger sale_lines_deduct_after_insert
after insert on sale_lines
for each row execute function public.sale_lines_deduct_after_insert();

create function public.sale_lines_reverse_before_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.reverse_sale_line_consumption(old.id);
  return old;
end;
$$;

-- BEFORE, so the old consumption is still in the ledger to read and reverse
-- (an AFTER DELETE trigger would run once ON DELETE CASCADE has already
-- removed sale_line_consumption's rows for this line).
create trigger sale_lines_reverse_before_delete
before delete on sale_lines
for each row execute function public.sale_lines_reverse_before_change();

create trigger sale_lines_reverse_before_update
before update on sale_lines
for each row execute function public.sale_lines_reverse_before_change();

create function public.sale_lines_rededuct_after_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.deduct_for_sale_line(new);
  return new;
end;
$$;

-- Runs after sale_lines_reverse_before_update has already returned the old
-- consumption, so this deducts against the corrected remaining_length_ft —
-- an UPDATE is "undo the old line, then place the new one," not a diff.
create trigger sale_lines_rededuct_after_update
after update on sale_lines
for each row execute function public.sale_lines_rededuct_after_update();

-- ----------------------------------------------------------------------------
-- Voiding a sale returns every one of its lines' stock. There is no
-- symmetric un-void path — sales_void_fields_consistent and the RBAC-driven
-- RLS on `sales` (docs/RBAC.md: only admins void, and there's no "unvoid" in
-- the app) mean a sale only ever moves is_voided false -> true, once.
-- ----------------------------------------------------------------------------
create function public.sales_void_returns_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line_id uuid;
begin
  for v_line_id in select id from sale_lines where sale_id = new.id loop
    perform public.reverse_sale_line_consumption(v_line_id);
  end loop;
  return new;
end;
$$;

create trigger sales_void_returns_stock
after update of is_voided on sales
for each row
when (new.is_voided = true and old.is_voided = false)
execute function public.sales_void_returns_stock();

-- ----------------------------------------------------------------------------
-- waste_log deduction — simpler than sale_lines: one roll, no cascade, no
-- reversal (waste_log has no update/delete RLS policy — a bad entry gets a
-- correcting entry, not an edit, same as the payment ledger).
-- ----------------------------------------------------------------------------
create function public.waste_log_deduct_stock()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_remaining numeric;
begin
  select remaining_length_ft into v_remaining
  from inventory_rolls where id = new.roll_id
  for update;

  if v_remaining is null then
    raise exception 'roll % does not exist', new.roll_id;
  end if;

  if v_remaining < new.length_ft then
    raise exception 'waste of %ft exceeds the %ft remaining on roll %',
      new.length_ft, v_remaining, new.roll_id;
  end if;

  update inventory_rolls
    set remaining_length_ft = remaining_length_ft - new.length_ft
    where id = new.roll_id;

  return new;
end;
$$;

create trigger waste_log_deduct_stock
after insert on waste_log
for each row execute function public.waste_log_deduct_stock();

-- ----------------------------------------------------------------------------
-- RLS — sale_line_consumption is a system-maintained ledger, same pattern as
-- waste_log: readable by any authenticated user (it's useful audit trail —
-- "which roll did this job actually come off"), writable only by the
-- SECURITY DEFINER functions above, which run as the table owner and so
-- bypass RLS. No insert/update/delete policy is granted to authenticated —
-- there is deliberately no way to write this table except by inserting into
-- sale_lines/waste_log or voiding a sale.
-- ----------------------------------------------------------------------------
alter table sale_line_consumption enable row level security;

create policy "sale_line_consumption_select" on sale_line_consumption
  for select to authenticated using (true);

grant select, insert, update, delete on sale_line_consumption to authenticated;
