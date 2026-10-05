-- Migration 004: lock RLS to the single owner (decision D13)
--
-- Replaces the 9 "*_authenticated" policies from 003 (any signed-in user) with 9 "*_owner" policies
-- that only match the owner's auth uid: (select auth.uid()) = '<owner id>'.
-- The owner id is read from auth.users at apply time, so this file contains no uuid literal and the
-- public repo never holds the id. The migration RAISES unless auth.users has exactly 1 user.
-- Still NO DELETE policy (D11): the app can never hard-delete.
--
-- IMPORTANT: the policies point at one specific auth user. If the owner's Auth user is ever deleted
-- and re-created (new uid), all access is denied until a NEW migration re-points the policies to the
-- new uid (same pattern as this file). Public sign-ups must stay disabled.

do $$
declare
  user_count integer;
  owner_uid uuid;
  t text;
begin
  select count(*) into user_count from auth.users;
  if user_count <> 1 then
    raise exception 'Migration 004 needs exactly 1 auth user (the owner); found %', user_count;
  end if;
  select id into owner_uid from auth.users;

  foreach t in array array['farmers', 'usage_entries', 'payments'] loop
    execute format('drop policy %I on public.%I', t || '_select_authenticated', t);
    execute format('drop policy %I on public.%I', t || '_insert_authenticated', t);
    execute format('drop policy %I on public.%I', t || '_update_authenticated', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using ((select auth.uid()) = %L::uuid)',
      t || '_select_owner', t, owner_uid);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = %L::uuid)',
      t || '_insert_owner', t, owner_uid);
    execute format(
      'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = %L::uuid) with check ((select auth.uid()) = %L::uuid)',
      t || '_update_owner', t, owner_uid, owner_uid);
  end loop;
end $$;
