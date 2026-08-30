-- ============================================================================
-- Port the nesting calculation into deduct_for_sale_line()
-- ============================================================================
-- The previous pass measured this: without nesting, the trigger reserved
-- 8-12x what a job actually needs on realistic sticker-run inputs (630ft vs
-- 52.08ft for 4in x 2.5in x 3000; 174.25ft vs 21.5ft for 6in x 2in x 1025).
-- That isn't a rounding error, it's the difference between laying items end
-- to end and packing them side-by-side across the roll — and it's large
-- enough to make the trigger reject real orders as understocked when the
-- roll has plenty of length left.
--
-- This replaces the single-roll consumption formula with the old app's
-- actual tiling calculation (lib/inventory-deduction.ts): for each
-- orientation, how many items fit across the roll's width
-- (itemsPerRow = floor((rollWidth + tolerance) / itemDimension)), how many
-- rows of the item's other dimension that quantity needs
-- (ceil(quantity / itemsPerRow)), and take whichever orientation's total is
-- shorter. The +0.01 tolerance is ported as-is — it exists to absorb
-- floating-point edge cases in the old app (an item exactly as wide as the
-- roll shouldn't fail to fit), and costs nothing to keep even though this
-- schema stores dimensions as fixed-point numeric.
--
-- Everything else about deduct_for_sale_line() is unchanged: this is still
-- "how much of ONE roll does this line need," decided once against the
-- FIFO-first roll with stock and then drained across however many rolls the
-- cascade takes — not a re-optimisation per roll, and not an optimiser that
-- arranges other jobs alongside this one. Both of those stay out of the
-- trigger, as decided in the migration that first added it.
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
