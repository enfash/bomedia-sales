-- ============================================================================
-- Widen line-item dimension precision
-- ============================================================================
-- sale_lines.width_ft/height_ft and quote_lines.width_ft/height_ft were
-- numeric(8,2) — two decimal places, the nearest 0.01ft (~0.12in). For a job
-- entered in inches (job_unit = 'in'), that rounding happens once per line,
-- before deduct_for_sale_line() runs, and its error scales with quantity:
-- 2.5in / 12 = 0.2083...ft rounds to 0.21ft, a difference of only 0.0017ft —
-- but a 3000-piece run multiplies that into a 5ft error before any nesting
-- logic even sees the job (630ft trigger-computed at 2dp vs 625ft from the
-- un-rounded division; this is on top of, and separate from, the larger
-- nesting gap fixed in the previous migration).
--
-- numeric(10,4) — four decimal places, ~0.00012in — makes that rounding step
-- small enough to be irrelevant at any realistic order quantity.
-- Postgres refuses to ALTER COLUMN TYPE on a column a generated column
-- depends on ("cannot alter type of a column used by a generated column"),
-- so sqft has to be dropped and re-added around the width_ft/height_ft
-- change. Its own definition — numeric(10,2), width_ft * height_ft — is
-- unchanged; see the reasoning below for why sqft's precision doesn't need
-- widening even though its inputs just were.
alter table sale_lines drop column sqft;
alter table sale_lines
  alter column width_ft type numeric(10, 4),
  alter column height_ft type numeric(10, 4);
alter table sale_lines
  add column sqft numeric(10, 2) generated always as (width_ft * height_ft) stored;

alter table quote_lines drop column sqft;
alter table quote_lines
  alter column width_ft type numeric(10, 4),
  alter column height_ft type numeric(10, 4);
alter table quote_lines
  add column sqft numeric(10, 2) generated always as (width_ft * height_ft) stored;

-- Audited every other dimension column in the schema for the same failure
-- mode (a small, inch-derived value later multiplied by a large quantity)
-- and found none needing the same fix:
--   - inventory_rolls.width_ft / raw_length_ft / total_length_ft /
--     remaining_length_ft / low_stock_threshold_ft, waste_log.length_ft —
--     all entered directly in feet by a person (a roll's width, a roll's
--     purchased length, one waste measurement), never derived from inches,
--     never multiplied by a quantity column. numeric(8,2)/numeric(10,2) is
--     plenty of precision for a value nothing amplifies.
--   - sale_lines.sqft, quote_lines.sqft (generated, numeric(10,2)) — a
--     per-unit reporting figure. Nothing in the schema multiplies it by
--     quantity and stores the result, so its own rounding doesn't compound.
--   - sale_line_consumption.length_ft (numeric(10,2)) — this is the
--     already-computed total for a line; quantity has already been folded
--     in via ceil(quantity / itemsPerRow) before this column is written, so
--     it's not a per-unit value quantity still gets multiplied against.
--     Rounding it to 2dp after the fact costs at most +/-0.005ft, which
--     doesn't compound further.
