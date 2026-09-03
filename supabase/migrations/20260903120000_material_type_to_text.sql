-- ============================================================================
-- material_type: enum → text
-- ============================================================================
-- Found wiring new-sales.tsx to create_sale: every real material name this
-- app actually produces comes from Settings' admin-editable materials
-- catalogue (src/context/settings-context.tsx's DEFAULT_SETTINGS.materials —
-- 'FLEX-3FT', 'SAV-4FT', 'CLEAR-STICKER-4FT', 'WINDOW-GRAPHICS-4FT',
-- 'SOLITE-3FT', ...), not the five fixed values this enum was created with
-- ('Flex', 'SAV', 'Window Graphics', 'Solite', 'Clear Stickers') — none of
-- which match any real material name in the app. Every sale line failed
-- create_sale with `invalid input value for enum material_type`, not just
-- an unusual one — this is not a missing enum value, it's the wrong type
-- for a value the product deliberately treats as open, shop-editable data,
-- not a closed system category. A shop can add a material in Settings at
-- any time; a fixed enum can never stay in sync with that by construction.
--
-- inventory_rolls and quote_lines carry the same column for the same reason
-- (and are both currently unpopulated — inventory_rolls always empty per
-- 20260830120000_skip_untracked_inventory.sql, quote_lines unwritten since
-- quotes stay on Firebase), so converting them alongside sale_lines costs
-- nothing today and avoids the same failure the moment either is used.

-- Both unconsumed_sale_lines (20260830120000_skip_untracked_inventory.sql)
-- and materials_valuation (20260829120400_views.sql) read a material_type
-- column, which blocks ALTER COLUMN TYPE outright ("cannot alter type of a
-- column used by a view or rule") — drop and recreate both around the
-- change, identical definitions, just picking up the new column type.
drop view unconsumed_sale_lines;
drop view materials_valuation;

alter table sale_lines alter column material_type type text using material_type::text;
alter table inventory_rolls alter column material_type type text using material_type::text;
alter table quote_lines alter column material_type type text using material_type::text;

drop type material_type;

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
  sum(width_ft * (total_length_ft - remaining_length_ft) * price_per_sqft) as realised_expected_revenue
from inventory_rolls
group by material_type, width_ft;

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

-- create_sale cast the incoming jsonb field to the enum; jsonb ->> already
-- yields text, so the cast is simply removed, not replaced.
create or replace function public.create_sale(
  p_receipt_number text,
  p_client_id uuid,
  p_lines jsonb,
  p_adjustments jsonb default '[]'::jsonb,
  p_notes text default null,
  p_due_date date default null,
  p_opening_payment jsonb default null
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
      v_line ->> 'material_type',
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
