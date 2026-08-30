-- ============================================================================
-- Verify
-- ============================================================================
-- Runs as the last step of every migration replay (including `supabase db
-- reset`), so a regression fails the replay itself rather than surfacing
-- later as a wrong number in the app. Each check states the invariant it's
-- protecting; a failure here means a change upstream broke a decision
-- documented in the earlier migrations.

do $$
declare
  v_count integer;
  v_names text;
begin
  -- expense_category: 21 values (old lib/constants.ts), not the 6-bucket UI grouping.
  select count(*) into v_count from pg_enum where enumtypid = 'expense_category'::regtype;
  if v_count <> 21 then
    raise exception 'expense_category has % values, expected 21', v_count;
  end if;

  -- waste_reason: 8 values.
  select count(*) into v_count from pg_enum where enumtypid = 'waste_reason'::regtype;
  if v_count <> 8 then
    raise exception 'waste_reason has % values, expected 8', v_count;
  end if;

  -- job_status: the Expo ProductionStage set, and specifically NOT the old
  -- system's 'Quoted' (see the reconciliation note in 20260829120100_enums.sql).
  select count(*) into v_count from pg_enum where enumtypid = 'job_status'::regtype;
  if v_count <> 5 then
    raise exception 'job_status has % values, expected 5', v_count;
  end if;
  if 'Quoted' = any(enum_range(null::job_status)::text[]) then
    raise exception 'job_status must not contain ''Quoted'' — a quote that has not converted has no row in sales';
  end if;

  -- payment_method: 'Transfer', matching what the live Expo ledger already
  -- writes — not the old app's 'Bank Transfer'.
  if 'Transfer' <> all(enum_range(null::payment_method)::text[]) then
    raise exception 'payment_method must contain ''Transfer''';
  end if;
  if 'Bank Transfer' = any(enum_range(null::payment_method)::text[]) then
    raise exception 'payment_method must not contain the old ''Bank Transfer'' label';
  end if;

  -- Dimensions live on the line, not the batch.
  if exists (
    select 1 from information_schema.columns
    where table_name = 'sales' and column_name in ('width_ft', 'height_ft', 'sqft')
  ) then
    raise exception 'sales must not carry dimension columns — those belong on sale_lines';
  end if;
  select string_agg(column_name, ', ') into v_names
  from information_schema.columns
  where table_name = 'sale_lines' and column_name in ('width_ft', 'height_ft', 'sqft');
  if v_names is null or v_names not like '%width_ft%' or v_names not like '%height_ft%' or v_names not like '%sqft%' then
    raise exception 'sale_lines is missing one of width_ft/height_ft/sqft (found: %)', coalesce(v_names, '<none>');
  end if;

  -- No stored derived values: payment status has no column anywhere (it's
  -- computed in the app, computePaymentStatus, same as it is today).
  if exists (
    select 1 from information_schema.columns
    where table_name in ('sales', 'payment_batches', 'payment_allocations')
      and column_name ilike '%status%'
      and column_name <> 'job_status' -- the one legitimate stored status: production stage
  ) then
    raise exception 'found a stored status column outside job_status — payment status must stay derived';
  end if;

  -- inventory_rolls.status and cost_per_sqft must be GENERATED, not plain
  -- columns an app could let drift out of sync with their inputs.
  if (
    select is_generated from information_schema.columns
    where table_name = 'inventory_rolls' and column_name = 'status'
  ) <> 'ALWAYS' then
    raise exception 'inventory_rolls.status must be a generated column';
  end if;
  if (
    select is_generated from information_schema.columns
    where table_name = 'inventory_rolls' and column_name = 'cost_per_sqft'
  ) <> 'ALWAYS' then
    raise exception 'inventory_rolls.cost_per_sqft must be a generated column';
  end if;

  -- The payment_allocations-sum-to-batch-total invariant must be enforced by
  -- a deferred constraint trigger (a plain CHECK cannot express a cross-row
  -- aggregate).
  if not exists (
    select 1 from pg_trigger
    where tgname = 'payment_allocations_sum_check' and tgdeferrable
  ) then
    raise exception 'payment_allocations_sum_check must exist and be deferrable';
  end if;

  -- Every table in the domain must have RLS enabled — a table created
  -- without it is readable/writable by anyone with a valid session,
  -- regardless of what policies exist elsewhere.
  select string_agg(relname, ', ') into v_names
  from pg_class
  where relnamespace = 'public'::regnamespace
    and relkind = 'r'
    and not relrowsecurity;
  if v_names is not null then
    raise exception 'tables without RLS enabled: %', v_names;
  end if;

  raise notice 'verify: all invariants held';
end;
$$;
