-- ============================================================================
-- activity — port slice 1 of the db.ts port
-- ============================================================================
-- The Firebase-era feed (activity/{pushId}) had no Postgres equivalent at
-- all — checked the migrations before writing this, there's genuinely
-- nothing here yet. Every write-slice from here on (expenses, sales) wants
-- to log to this table from the start, so it goes first rather than being
-- retrofitted once three different write paths already disagree about where
-- activity lives.
--
-- Same admin-read/append-only-for-everyone shape as the Firebase security
-- rules: only admins can read the feed; staff can append but never edit or
-- delete an entry, admins included — see docs/RBAC.md.
create type activity_type as enum (
  'sale_created',
  'payment_recorded',
  'production_moved',
  'expense_logged',
  'sale_deleted',
  'sale_edited'
);

-- actor_name is a deliberate snapshot, not a join to profiles.name — see
-- src/services/activity.ts and the same decision applied to sales/expenses/
-- payment_batches in later slices. An activity entry is a historical record
-- of who did something; it must keep saying who that was even if their
-- profile name is corrected afterwards.
create table activity (
  id uuid primary key default gen_random_uuid(),
  type activity_type not null,
  message text not null,
  actor_uid uuid not null references auth.users (id),
  actor_name text not null,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index activity_created_at_idx on activity (created_at desc);

alter table activity enable row level security;

create policy "activity_select_admin" on activity
  for select to authenticated using (is_admin());

create policy "activity_insert_self" on activity
  for insert to authenticated with check (actor_uid = auth.uid());
-- No update/delete policy for anyone, admins included — append-only, same
-- as the Firebase rules it replaces.
--
-- TRAP, confirmed by hand: a staff insert here only succeeds with
-- `Prefer: return=minimal`. Postgres applies the table's SELECT policy to
-- an INSERT's RETURNING output, and if the inserted row doesn't satisfy any
-- SELECT policy (staff never satisfies activity_select_admin's is_admin()),
-- the INSERT ITSELF fails with "new row violates row-level security
-- policy" — the exact same error text as a genuine WITH CHECK failure, and
-- indistinguishable from one without checking which policy actually fired.
-- Firebase's write-only rule had no such coupling: being allowed to write
-- never implied being able to read back what you wrote. supabase-js sends
-- return=minimal by default for `.insert(x)` (only return=representation if
-- `.select()` is chained after it) — src/services/activity.ts's
-- logActivity relies on that default and must never chain `.select()` onto
-- this insert without also widening activity_select_admin to cover the
-- inserting user's own rows.

grant select, insert, update, delete on activity to authenticated;
