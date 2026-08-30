-- ============================================================================
-- allowed_users — the backstop for closed signup
-- ============================================================================
-- Sign-up is closed: this app has no self-registration path, ever. Accounts
-- are provisioned by the owner, one email at a time, before that person ever
-- signs in. `[auth] enable_signup = false` in supabase/config.toml (and the
-- matching "Allow new users to sign up" toggle in the hosted dashboard) is
-- the primary switch — but a toggle is one accidental click away from being
-- flipped back, silently reopening signup to anyone with a Google account.
-- This table plus the trigger below is what still holds even then: it runs
-- inside the database itself, on every insert into auth.users, regardless of
-- what the dashboard says.
create extension if not exists citext;

create table allowed_users (
  email citext primary key,
  role user_role not null default 'staff',
  invited_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- reject_unlisted_signup — BEFORE INSERT, not AFTER.
--
-- Trigger-timing is what guarantees no orphaned profiles row for a rejected
-- email, not extra bookkeeping: a BEFORE trigger that raises aborts the
-- INSERT into auth.users itself, so the row this statement was trying to
-- create never exists — and on_auth_user_created (handle_new_user, below)
-- is an AFTER INSERT trigger, which Postgres only ever fires once a row has
-- actually landed. A statement that never inserted a row can't fire an
-- AFTER trigger reacting to it. If this were AFTER INSERT instead, the user
-- would already exist in auth.users by the time it ran, and rejecting it
-- there would leave that row behind (and by then handle_new_user might
-- already have created the profile it's meant to prevent).
-- ----------------------------------------------------------------------------
create function public.reject_unlisted_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.allowed_users where email = new.email) then
    raise exception 'signups are closed — % is not on the allowed_users list', new.email;
  end if;
  return new;
end;
$$;

create trigger reject_unlisted_signup
before insert on auth.users
for each row execute function public.reject_unlisted_signup();

-- ----------------------------------------------------------------------------
-- handle_new_user — now sources role from allowed_users instead of always
-- defaulting to 'staff'. By the time this AFTER INSERT trigger runs,
-- reject_unlisted_signup has already guaranteed new.email is in
-- allowed_users, so the lookup below should never actually miss — the
-- coalesce to 'staff' is defense in depth, matching the fail-safe posture
-- the rest of this app already takes on role resolution (see
-- src/context/auth-context.tsx), not a code path expected to be reached.
--
-- Name lookup checks both 'full_name' and 'name': Supabase's Google
-- provider is documented to populate both keys from the same claim, but
-- checking only one here and the other in toAppUser() (src/lib/auth
-- consumers, src/context/auth-context.tsx) would make the two layers
-- disagree about a real person's name for no reason. Same coalesce order in
-- both places now.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role user_role;
begin
  select role into v_role from public.allowed_users where email = new.email;

  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', new.email),
    coalesce(v_role, 'staff')
  );

  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- RLS — admin-only, full stop. Staff have no read or write access at all;
-- unlike every other table in this schema, there is no "staff can read,
-- admin can write" tier here, because the allowlist is itself the thing that
-- decides who gets to be staff in the first place.
-- ----------------------------------------------------------------------------
alter table allowed_users enable row level security;

create policy "allowed_users_admin_select" on allowed_users
  for select to authenticated using (is_admin());

create policy "allowed_users_admin_insert" on allowed_users
  for insert to authenticated with check (is_admin());

create policy "allowed_users_admin_update" on allowed_users
  for update to authenticated using (is_admin()) with check (is_admin());

create policy "allowed_users_admin_delete" on allowed_users
  for delete to authenticated using (is_admin());

grant select, insert, update, delete on allowed_users to authenticated;

-- ----------------------------------------------------------------------------
-- Seed: the owner's own email, or closing signup locks out the very first
-- sign-in.
-- ----------------------------------------------------------------------------
insert into allowed_users (email, role) values ('elijahfasugba@gmail.com', 'admin');
