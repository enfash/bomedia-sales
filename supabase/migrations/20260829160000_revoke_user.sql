-- ============================================================================
-- revoke_user — closing the revocation gap
-- ============================================================================
-- Until now, removing a row from allowed_users only blocked a NEW signup —
-- reject_unlisted_signup (previous migration) checks allowed_users on
-- INSERT into auth.users, never on anything after. An existing auth.users
-- row survives, and an existing session keeps refreshing until its refresh
-- token is itself revoked. Offboarding was silently two steps (remove from
-- allowed_users, AND separately delete the person from Authentication in
-- the dashboard); nothing said so. This migration makes deleting from
-- allowed_users — by function or by hand — the whole job.
--
-- One real constraint shapes everything below: sales.logged_by/voided_by,
-- payment_batches.collected_by, expenses.logged_by, waste_log.logged_by and
-- quotes.created_by all reference auth.users(id) with no ON DELETE action —
-- deliberately, so a sale's ledger entry can never lose who created it out
-- from under it. That means DELETE FROM auth.users fails outright with a
-- foreign_key_violation for anyone who has ever logged a sale, payment,
-- expense, waste entry, or quote — which in practice is most staff, since
-- that's the job. Losing that attribution to make a delete succeed would be
-- worse than the delete failing, so this doesn't touch those FK definitions.
-- Instead: allowed_users is removed either way, blocking a fresh sign-in;
-- the account is banned (auth.users.banned_until) and every existing
-- session/refresh token for it is deleted, blocking a refresh of one already
-- in progress — GoTrue's refresh-grant endpoint never consults
-- allowed_users, only whether the account is banned and the refresh token
-- still exists, so without this step someone with real activity history
-- would keep refreshing indefinitely despite being "revoked". Only THEN is
-- auth.users deletion attempted, allowed to fail loudly as a WARNING rather
-- than aborting the operation if it hits that FK. See
-- delete_auth_user_for_email below.

-- ----------------------------------------------------------------------------
-- delete_auth_user_for_email — shared by revoke_user() and the AFTER DELETE
-- trigger below. NOT meant to be called directly by anything else, which is
-- why EXECUTE is revoked from every client-facing role below — that revoke
-- is the actual gate, deliberately not an is_admin() check inside the
-- function body. An is_admin() check would block the Table Editor path task
-- #2 exists for: Studio's Table Editor (and psql, and a migration) connects
-- straight to Postgres with no request.jwt.claim — auth.uid() is null there,
-- so is_admin() would read false and reject a legitimate deletion by the
-- project's own owner. Reaching this function at all already means one of:
-- revoke_user() (which checks is_admin() itself, before ever calling this),
-- or the trigger — which only fires once a row has actually been deleted
-- from allowed_users, and RLS's allowed_users_admin_delete policy already
-- restricted who could do that through the API. Direct database access
-- (Table Editor, psql, a migration) bypasses RLS by nature, at a trust level
-- past what an in-app admin check could add anyway.
-- ----------------------------------------------------------------------------
create function public.delete_auth_user_for_email(target_email citext)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  select id into v_uid from auth.users where email = target_email;
  if v_uid is null then
    return; -- already gone (or never existed) — quiet success, not an error
  end if;

  -- Ban + purge sessions FIRST, unconditionally, before even attempting the
  -- delete below — this is what actually closes the gap for anyone with real
  -- activity (see the migration header): sales.logged_by and the other
  -- attribution columns have no ON DELETE action, so DELETE FROM auth.users
  -- fails for most real staff, and GoTrue's refresh-grant endpoint never
  -- consults allowed_users — only auth.users.banned_until and whether a
  -- refresh token still exists. Without this, someone revoked while their
  -- auth.users row survives would keep refreshing indefinitely, which is
  -- exactly the gap this migration exists to close. Doing it unconditionally
  -- (not just in the exception handler below) means the outcome doesn't
  -- depend on which branch executes: revoked is revoked, whether or not the
  -- row itself could also be deleted.
  update auth.users set banned_until = 'infinity' where id = v_uid;
  delete from auth.sessions where user_id = v_uid;
  delete from auth.refresh_tokens where user_id = v_uid::text;

  begin
    delete from auth.users where id = v_uid;
  exception
    when foreign_key_violation then
      raise warning
        '% is banned and signed out — they cannot sign in or refresh a session again — but their auth.users row (and the sales/payments/expenses/waste/quotes attributed to them) could not be deleted. Reassign or archive that history first if the account record itself must be fully removed. See supabase/README.md -> "Offboarding".',
        target_email;
  end;
end;
$$;

revoke execute on function public.delete_auth_user_for_email(citext) from public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- prevent_last_admin_removal — BEFORE DELETE, so this guards every way a row
-- can leave allowed_users: revoke_user() below, a direct DELETE via psql or
-- the SQL editor, and the Table Editor, all issue the same DELETE statement
-- underneath and all go through this trigger. Putting the check here instead
-- of duplicating it inside revoke_user() means there's exactly one place
-- this rule lives, and no entry point can bypass it by construction.
-- ----------------------------------------------------------------------------
create function public.prevent_last_admin_removal()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_other_admins integer;
begin
  if old.role <> 'admin' then
    return old;
  end if;

  select count(*) into v_other_admins
  from public.allowed_users
  where role = 'admin' and email <> old.email;

  if v_other_admins = 0 then
    raise exception
      'cannot remove % from allowed_users — they are the last remaining admin; removing them would lock every admin-only capability in the app with no way back in',
      old.email;
  end if;

  return old;
end;
$$;

create trigger prevent_last_admin_removal
before delete on allowed_users
for each row execute function public.prevent_last_admin_removal();

-- ----------------------------------------------------------------------------
-- revoke_deleted_allowed_user — AFTER DELETE, so it only ever runs once
-- prevent_last_admin_removal (BEFORE DELETE, above) has already let the
-- delete through. This is what makes a direct `delete from allowed_users`
-- (Table Editor included) do the full job instead of half of it.
--
-- Does not recurse with revoke_user(): the only table this trigger's own
-- delete touches is auth.users (via delete_auth_user_for_email), which has
-- no trigger that deletes from allowed_users — so nothing here can fire
-- allowed_users' own DELETE triggers again. Calling revoke_user() from a
-- trigger ON allowed_users would recurse into this trigger, or at best
-- perform a second unnecessary delete on allowed_users; this deliberately
-- does not do that.
-- ----------------------------------------------------------------------------
create function public.revoke_deleted_allowed_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.delete_auth_user_for_email(old.email);
  return null; -- return value is ignored for AFTER triggers
end;
$$;

create trigger revoke_deleted_allowed_user
after delete on allowed_users
for each row execute function public.revoke_deleted_allowed_user();

-- ----------------------------------------------------------------------------
-- revoke_user — the RPC an admin calls from the app or the SQL editor.
--
-- Idempotent by construction, not by an extra existence check: deleting a
-- row that doesn't exist is already a normal, silent no-op in SQL, and
-- delete_auth_user_for_email does its own "already gone" check. The
-- last-admin guard isn't duplicated here either — it's on the trigger above,
-- so this and a direct DELETE enforce the exact same rule.
-- ----------------------------------------------------------------------------
create function public.revoke_user(target_email citext)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin() then
    raise exception 'only an admin can revoke a user';
  end if;

  delete from public.allowed_users where email = target_email;

  -- Redundant with what revoke_deleted_allowed_user's AFTER DELETE trigger
  -- just did when the row above existed (delete_auth_user_for_email is a
  -- no-op the second time, since the row's already gone) — kept so
  -- revoke_user() still does the full job on its own if that trigger is
  -- ever dropped, and so an orphaned auth.users row with no matching
  -- allowed_users row (state from before this migration) still gets caught.
  perform public.delete_auth_user_for_email(target_email);
end;
$$;
