-- ============================================================================
-- Inventory deduction & job_status transition — proof tests
-- ============================================================================
-- Plain SQL, not pgTAP: each scenario is a DO block that asserts with
-- RAISE EXCEPTION on failure and RAISE NOTICE 'PASS: ...' on success. Run
-- inside one transaction that is always rolled back at the end, so this
-- never leaves fixture data behind in a real database — it's a proof, not a
-- seed script.
--
-- Run against a freshly-reset local stack:
--   docker exec -i supabase_db_bomedia-sales psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 -f supabase/tests/inventory_deduction.sql
--
-- (docker exec's stdin doesn't resolve a host path, so pipe the file in, or
-- `cat supabase/tests/inventory_deduction.sql | docker exec -i ... psql`.)

begin;

-- A signed-in actor to satisfy the FK/NOT NULL columns this test touches
-- (logged_by, collected_by, voided_by). Bypasses profiles_role_change_guard
-- and every RLS policy by running as the table owner (postgres), same as
-- any local psql session against this database.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'test-actor@test.local');
alter table profiles disable trigger profiles_role_change_guard;
update profiles set role = 'admin' where id = '00000000-0000-0000-0000-000000000001';
alter table profiles enable trigger profiles_role_change_guard;

-- A raw psql session is otherwise nobody as far as auth.uid() is concerned,
-- even though it connects as the table-owning superuser — is_admin() and the
-- guard triggers that call it (sales_staff_update_guard, in particular, for
-- the void fields Test 3 needs to set) key off auth.uid(), not the Postgres
-- role. Claim this admin for the rest of the transaction so those resolve
-- exactly as they would for a real signed-in admin session.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);

insert into clients (id, name) values ('00000000-0000-0000-0000-0000000000c1', 'Test Client');

-- ----------------------------------------------------------------------------
-- Test 1 — FIFO cascade across two rolls
-- ----------------------------------------------------------------------------
-- Roll A (older, nearly empty) then roll B (newer, full). A line that needs
-- more than roll A has left must drain A to 0 and spill the remainder onto
-- B, in that order, and record both deductions.
--
-- Item is 1ft x 1ft (deliberately square) so normal and flipped nesting
-- agree exactly — itemsPerRow = floor(4.01/1) = 4 either way, so
-- consumption is ceil(20/4) * 1 = 5ft regardless of which orientation wins.
-- That keeps this test about the FIFO cascade specifically; the nesting
-- arithmetic itself is proven separately against the two reference cases
-- (4in x 2.5in x 3000 -> 52.08ft, 6in x 2in x 1025 -> 21.5ft).
do $$
declare
  v_roll_a_remaining numeric;
  v_roll_b_remaining numeric;
  v_consumption_count integer;
  v_taken_from_a numeric;
  v_taken_from_b numeric;
begin
  insert into inventory_rolls
    (id, roll_code, item_name, material_type, width_ft, raw_length_ft, total_length_ft, remaining_length_ft, cost, price_per_sqft, created_at)
  values
    ('00000000-0000-0000-0000-00000000ba01', 'FLEX-4FT-A', 'Flex 280gsm', 'Flex', 4, 12, 2, 2, 1000, 50, now() - interval '2 days'),
    ('00000000-0000-0000-0000-00000000ba02', 'FLEX-4FT-B', 'Flex 280gsm', 'Flex', 4, 60, 50, 50, 2000, 50, now() - interval '1 day');

  insert into sales (id, client_id, logged_by)
  values ('00000000-0000-0000-0000-00000000ea01', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001');

  -- 1ft x 1ft x 20 nests 4-per-row either way -> ceil(20/4)*1 = 5ft needed.
  -- Roll A only has 2ft left, so 2ft must come from A and 3ft must spill to B.
  insert into sale_lines (id, sale_id, material_type, width_ft, height_ft, quantity, unit_price, total)
  values ('00000000-0000-0000-0000-00000000ec01', '00000000-0000-0000-0000-00000000ea01', 'Flex', 1, 1, 20, 200, 4000);

  select remaining_length_ft into v_roll_a_remaining from inventory_rolls where id = '00000000-0000-0000-0000-00000000ba01';
  select remaining_length_ft into v_roll_b_remaining from inventory_rolls where id = '00000000-0000-0000-0000-00000000ba02';
  select count(*) into v_consumption_count from sale_line_consumption where sale_line_id = '00000000-0000-0000-0000-00000000ec01';
  select length_ft into v_taken_from_a from sale_line_consumption where sale_line_id = '00000000-0000-0000-0000-00000000ec01' and roll_id = '00000000-0000-0000-0000-00000000ba01';
  select length_ft into v_taken_from_b from sale_line_consumption where sale_line_id = '00000000-0000-0000-0000-00000000ec01' and roll_id = '00000000-0000-0000-0000-00000000ba02';

  if v_roll_a_remaining <> 0 then
    raise exception 'TEST 1 FAILED: roll A should be fully drained (0), got %', v_roll_a_remaining;
  end if;
  if v_roll_b_remaining <> 47 then
    raise exception 'TEST 1 FAILED: roll B should have 47ft left (50 - 3 spillover), got %', v_roll_b_remaining;
  end if;
  if v_consumption_count <> 2 then
    raise exception 'TEST 1 FAILED: expected 2 consumption rows (one per roll touched), got %', v_consumption_count;
  end if;
  if v_taken_from_a <> 2 or v_taken_from_b <> 3 then
    raise exception 'TEST 1 FAILED: expected 2ft from A and 3ft from B, got % and %', v_taken_from_a, v_taken_from_b;
  end if;

  -- Roll A's generated status column should reflect the drain without
  -- anything having written it directly.
  if (select status from inventory_rolls where id = '00000000-0000-0000-0000-00000000ba01') <> 'Out of Stock' then
    raise exception 'TEST 1 FAILED: drained roll A should report status Out of Stock';
  end if;

  raise notice 'PASS: FIFO cascade drains the older roll first and spills the remainder onto the next one';
end;
$$;

-- ----------------------------------------------------------------------------
-- Test 2 — overdraw rejection
-- ----------------------------------------------------------------------------
-- A line that needs more length than exists across every matching roll must
-- reject the whole transaction: no partial deduction, no sale_line row left
-- behind, no consumption rows.
do $$
declare
  v_remaining_before numeric;
  v_remaining_after numeric;
  v_line_count integer;
  v_consumption_count integer;
  v_caught boolean := false;
begin
  insert into inventory_rolls
    (id, roll_code, item_name, material_type, width_ft, raw_length_ft, total_length_ft, remaining_length_ft, cost, price_per_sqft)
  values
    ('00000000-0000-0000-0000-00000000ba03', 'SAV-4FT-A', 'SAV vinyl', 'SAV', 4, 20, 10, 10, 500, 40);

  insert into sales (id, client_id, logged_by)
  values ('00000000-0000-0000-0000-00000000ea02', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001');

  select remaining_length_ft into v_remaining_before from inventory_rolls where id = '00000000-0000-0000-0000-00000000ba03';

  begin
    -- width 3 <= 4 (fits normal): consumes height * qty = 5 * 3 = 15ft against only 10ft available.
    insert into sale_lines (id, sale_id, material_type, width_ft, height_ft, quantity, unit_price, total)
    values ('00000000-0000-0000-0000-00000000ec02', '00000000-0000-0000-0000-00000000ea02', 'SAV', 3, 5, 3, 200, 3000);
  exception
    when others then
      v_caught := true;
      if sqlerrm not ilike '%insufficient%' then
        raise exception 'TEST 2 FAILED: expected an "insufficient stock" error, got: %', sqlerrm;
      end if;
  end;

  if not v_caught then
    raise exception 'TEST 2 FAILED: an overdrawing line was accepted instead of rejected';
  end if;

  select remaining_length_ft into v_remaining_after from inventory_rolls where id = '00000000-0000-0000-0000-00000000ba03';
  select count(*) into v_line_count from sale_lines where id = '00000000-0000-0000-0000-00000000ec02';
  select count(*) into v_consumption_count from sale_line_consumption where sale_line_id = '00000000-0000-0000-0000-00000000ec02';

  if v_remaining_after <> v_remaining_before then
    raise exception 'TEST 2 FAILED: roll remaining_length_ft changed (% -> %) despite the rejected insert', v_remaining_before, v_remaining_after;
  end if;
  if v_line_count <> 0 then
    raise exception 'TEST 2 FAILED: the rejected sale_line still exists';
  end if;
  if v_consumption_count <> 0 then
    raise exception 'TEST 2 FAILED: consumption rows exist for a rejected line';
  end if;

  raise notice 'PASS: an overdrawing line is rejected atomically — no partial deduction, no orphaned rows';
end;
$$;

-- ----------------------------------------------------------------------------
-- Test 3 — stock returned on void
-- ----------------------------------------------------------------------------
do $$
declare
  v_remaining_before numeric;
  v_remaining_after_deduct numeric;
  v_remaining_after_void numeric;
  v_consumption_count_before integer;
  v_consumption_count_after integer;
begin
  insert into inventory_rolls
    (id, roll_code, item_name, material_type, width_ft, raw_length_ft, total_length_ft, remaining_length_ft, cost, price_per_sqft)
  values
    ('00000000-0000-0000-0000-00000000ba04', 'SOLITE-5FT-A', 'Solite board', 'Solite', 5, 110, 100, 100, 3000, 60);

  insert into sales (id, client_id, logged_by)
  values ('00000000-0000-0000-0000-00000000ea03', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001');

  select remaining_length_ft into v_remaining_before from inventory_rolls where id = '00000000-0000-0000-0000-00000000ba04';

  -- width 4 <= 5 (fits normal): consumes height * qty = 3 * 2 = 6ft.
  insert into sale_lines (id, sale_id, material_type, width_ft, height_ft, quantity, unit_price, total)
  values ('00000000-0000-0000-0000-00000000ec03', '00000000-0000-0000-0000-00000000ea03', 'Solite', 4, 3, 2, 300, 600);

  select remaining_length_ft into v_remaining_after_deduct from inventory_rolls where id = '00000000-0000-0000-0000-00000000ba04';
  select count(*) into v_consumption_count_before from sale_line_consumption where sale_line_id = '00000000-0000-0000-0000-00000000ec03';

  if v_remaining_after_deduct <> v_remaining_before - 6 then
    raise exception 'TEST 3 FAILED: expected the line to deduct 6ft (100 -> 94), got %', v_remaining_after_deduct;
  end if;
  if v_consumption_count_before <> 1 then
    raise exception 'TEST 3 FAILED: expected one consumption row before voiding, got %', v_consumption_count_before;
  end if;

  update sales
    set is_voided = true,
        voided_at = now(),
        voided_by = '00000000-0000-0000-0000-000000000001',
        void_reason = 'test: proving stock returns on void'
    where id = '00000000-0000-0000-0000-00000000ea03';

  select remaining_length_ft into v_remaining_after_void from inventory_rolls where id = '00000000-0000-0000-0000-00000000ba04';
  select count(*) into v_consumption_count_after from sale_line_consumption where sale_line_id = '00000000-0000-0000-0000-00000000ec03';

  if v_remaining_after_void <> v_remaining_before then
    raise exception 'TEST 3 FAILED: voiding should return the full 6ft (back to %), got %', v_remaining_before, v_remaining_after_void;
  end if;
  if v_consumption_count_after <> 0 then
    raise exception 'TEST 3 FAILED: consumption ledger should be cleared for the voided line, found % rows', v_consumption_count_after;
  end if;

  raise notice 'PASS: voiding a sale returns every one of its lines'' stock and clears the consumption ledger';
end;
$$;

-- ----------------------------------------------------------------------------
-- Bonus — job_status transition guard: permissive everywhere except leaving
-- Delivered. Not one of the three requested proofs, but it's the other
-- deliverable in this same change, and the check is cheap.
-- ----------------------------------------------------------------------------
do $$
declare
  v_caught boolean := false;
  v_final_status job_status;
begin
  insert into sales (id, client_id, logged_by, job_status)
  values ('00000000-0000-0000-0000-00000000ea04', '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000001', 'Queued');

  -- Ordinary moves, including sideways and backwards among the non-Delivered
  -- stages, must all be allowed — this is deliberately not a forward-only
  -- state machine.
  update sales set job_status = 'Printing' where id = '00000000-0000-0000-0000-00000000ea04';
  update sales set job_status = 'Finishing' where id = '00000000-0000-0000-0000-00000000ea04';
  update sales set job_status = 'Queued' where id = '00000000-0000-0000-0000-00000000ea04'; -- backwards, but not out of Delivered
  update sales set job_status = 'Delivered' where id = '00000000-0000-0000-0000-00000000ea04';

  begin
    update sales set job_status = 'Printing' where id = '00000000-0000-0000-0000-00000000ea04';
  exception
    when others then
      v_caught := true;
      if sqlerrm not ilike '%Delivered%' then
        raise exception 'TEST 4 FAILED: expected a Delivered-related error, got: %', sqlerrm;
      end if;
  end;

  if not v_caught then
    raise exception 'TEST 4 FAILED: moving a Delivered sale back to Printing was accepted';
  end if;

  select job_status into v_final_status from sales where id = '00000000-0000-0000-0000-00000000ea04';
  if v_final_status <> 'Delivered' then
    raise exception 'TEST 4 FAILED: job_status should still be Delivered after the rejected move, got %', v_final_status;
  end if;

  raise notice 'PASS: job_status blocks only moves out of Delivered; every other transition is permitted';
end;
$$;

rollback;
