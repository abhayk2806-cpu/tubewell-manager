-- Migration 003: row level security (decision D11)
--
-- Single-user app: only the role "authenticated" with a real JWT (auth.uid() not null) may read, insert
-- or update. There is NO DELETE policy, so the app can never hard-delete; soft delete is an UPDATE of
-- deleted_at.
-- Consequences:
--   * Phase 8 "Replace" restore must work without client-side DELETE (for example soft-delete everything,
--     then insert, or a controlled database function).
--   * The Phase 10 test-data wipe is done with SQL by Claude Code, only on explicit owner approval.
-- Defence in depth (in addition to the policies):
--   * anon gets no table privileges at all.
--   * authenticated loses DELETE and TRUNCATE.

alter table public.farmers enable row level security;
alter table public.usage_entries enable row level security;
alter table public.payments enable row level security;

create policy farmers_select_authenticated on public.farmers
  for select to authenticated using ((select auth.uid()) is not null);
create policy farmers_insert_authenticated on public.farmers
  for insert to authenticated with check ((select auth.uid()) is not null);
create policy farmers_update_authenticated on public.farmers
  for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

create policy usage_entries_select_authenticated on public.usage_entries
  for select to authenticated using ((select auth.uid()) is not null);
create policy usage_entries_insert_authenticated on public.usage_entries
  for insert to authenticated with check ((select auth.uid()) is not null);
create policy usage_entries_update_authenticated on public.usage_entries
  for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

create policy payments_select_authenticated on public.payments
  for select to authenticated using ((select auth.uid()) is not null);
create policy payments_insert_authenticated on public.payments
  for insert to authenticated with check ((select auth.uid()) is not null);
create policy payments_update_authenticated on public.payments
  for update to authenticated using ((select auth.uid()) is not null) with check ((select auth.uid()) is not null);

revoke all on table public.farmers, public.usage_entries, public.payments from anon;
revoke delete, truncate on table public.farmers, public.usage_entries, public.payments from authenticated;
