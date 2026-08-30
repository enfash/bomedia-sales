-- ============================================================================
-- Actor-name snapshots — db.ts port, part of slice 2 (expenses)
-- ============================================================================
-- Decision: snapshot, not a live join. A financial record must keep saying
-- who did something at the time, not who they're called now — if a name is
-- corrected in `profiles` later, every past record attributed to that person
-- should still read the way it did when it was written. `profiles.name`
-- alone can't provide that; only a column written once, at insert time, can.
--
-- Only `expenses` gets this in this migration — it's the only table this
-- slice touches. `sales.logged_by_name`/`voided_by_name` and
-- `payment_batches.collected_by_name` are the same decision, added in the
-- migration that ports those tables (slice 4/5), not here — no reason to
-- add columns to tables nothing reads or writes yet.
alter table expenses add column logged_by_name text not null default '';
alter table expenses alter column logged_by_name drop default;
-- default dropped after add: existing rows (none yet, this table is
-- unused in production) get backfilled to '' during the ADD, but new rows
-- must always supply a real name explicitly — a blank snapshot defeats the
-- point of having one.
