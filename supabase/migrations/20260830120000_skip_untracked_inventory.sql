-- ============================================================================
-- Skip deduction for untracked materials — db.ts port, slice 4
-- ============================================================================
-- The app has never tracked physical stock anywhere — Settings' `materials`
-- catalog is a flat {id, name, price} list, no quantity field at all — so
-- inventory_rolls is empty for every material_type right now, and always
-- will be until the Sheets import (a separate job) populates it. Without
-- this change, deduct_for_sale_line() raises 'no stock available' on every
-- single sale, since the FIFO loop it runs never finds a roll to iterate.
--
-- Decision made explicitly rather than by seeding placeholder rolls: a fake
-- roll with fabricated remaining_length_ft would make deductions "succeed"
-- against stock that was never real, creating phantom consumption that has
-- to be unwound by hand once the real import lands. Recording the skip and
-- moving on is honest about what's actually known right now (nothing).
--
-- Only the zero-rolls-at-all case changes. Once a material has real rolls
-- (post-import), running out of them still raises exactly as before — see
-- the untouched "insufficient stock" branch below. That's real overdraw
-- protection against real numbers; this migration doesn't touch it.
--
-- FOLLOW-UP, once the Sheets import has populated inventory_rolls for every
-- material the app sells: re-tighten the zero-rolls branch back to raising.
-- unconsumed_sale_lines (below) is what that follow-up should query first —
-- it's the list of exactly which lines skipped deduction and why, so
-- re-tightening isn't a guess about whether it's safe yet.

alter table sale_line_consumption alter column roll_id drop not null;
alter table sale_line_consumption alter column length_ft drop not null;

alter table sale_line_consumption drop constraint sale_line_consumption_length_ft_check;
alter table sale_line_consumption add constraint sale_line_consumption_length_ft_check
  check (length_ft is null or length_ft > 0);

alter table sale_line_consumption add column skip_reason text;
alter table sale_line_consumption add constraint sale_line_consumption_skip_consistent check (
  (roll_id is null and length_ft is null and skip_reason is not null)
  or
  (roll_id is not null and length_ft is not null and skip_reason is null)
);

create or replace function public.deduct_for_sale_line(p_line sale_lines)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_voided boolean;
  v_normal_len numeric;
  v_flipped_len numeric;
  v_items_per_row integer;
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
      -- Decided once, against the FIFO-first roll with stock, then drained
      -- across however many rolls the cascade needs — mirrors the old app,
      -- which nested against the active/selected roll and cascaded that one
      -- computed length rather than re-nesting per roll.
      v_normal_len := null;
      v_flipped_len := null;

      if p_line.width_ft <= v_roll.width_ft + 0.01 then
        v_items_per_row := floor((v_roll.width_ft + 0.01) / p_line.width_ft)::integer;
        v_normal_len := ceil(p_line.quantity::numeric / v_items_per_row) * p_line.height_ft;
      end if;

      if p_line.height_ft <= v_roll.width_ft + 0.01 then
        v_items_per_row := floor((v_roll.width_ft + 0.01) / p_line.height_ft)::integer;
        v_flipped_len := ceil(p_line.quantity::numeric / v_items_per_row) * p_line.width_ft;
      end if;

      if v_flipped_len is not null and (v_normal_len is null or v_flipped_len < v_normal_len) then
        v_consume_length := v_flipped_len;
      elsif v_normal_len is not null then
        v_consume_length := v_normal_len;
      else
        -- A real roll exists for this material but the job is physically
        -- too wide for it in either orientation — unrelated to the
        -- untracked-material case below, and unaffected by it: this can
        -- only fire once at least one real roll exists to compare against.
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
    -- No inventory_rolls row exists for this material at all — not "out of
    -- stock", "never stocked". Record the skip and let the sale proceed;
    -- see the migration header for why this isn't a raise.
    insert into sale_line_consumption (sale_line_id, roll_id, length_ft, skip_reason)
      values (p_line.id, null, null, format('no inventory_rolls exist for material %s', p_line.material_type));
    return;
  end if;

  if v_remaining_to_deduct > 0 then
    raise exception 'insufficient % stock: %ft short of what this line needs across all rolls',
      p_line.material_type, round(v_remaining_to_deduct, 2);
  end if;
end;
$$;

-- ----------------------------------------------------------------------------
-- unconsumed_sale_lines — every line that skipped deduction, with enough to
-- act on: which material, and when. The skip is otherwise invisible (no
-- exception, no notice anyone would see) — this is what the post-import
-- follow-up above queries, rather than depending on anyone remembering
-- untracked materials exist.
-- ----------------------------------------------------------------------------
create view unconsumed_sale_lines
with (security_invoker = true) as
select
  slc.sale_line_id,
  sl.sale_id,
  sl.material_type,
  sl.quantity,
  s.created_at as sale_created_at,
  slc.skip_reason,
  slc.created_at as skipped_at
from sale_line_consumption slc
join sale_lines sl on sl.id = slc.sale_line_id
join sales s on s.id = sl.sale_id
where slc.roll_id is null;
