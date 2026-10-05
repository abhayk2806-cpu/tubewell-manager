-- Migration 002: audit columns maintained by triggers (decision D12)
--
-- One shared BEFORE INSERT OR UPDATE trigger function for farmers, usage_entries and payments.
-- INSERT: created_* and updated_* are forced to now() and auth.uid(). Client-supplied values are
--         ignored. deleted_at and deleted_by are forced to NULL.
-- UPDATE: created_at and created_by are immutable (old values are kept silently). updated_at and
--         updated_by are set to now() and auth.uid().
--         deleted_by is never client-editable: it is set to auth.uid() when deleted_at goes from NULL to
--         NOT NULL (soft delete), cleared when deleted_at goes back to NULL (restore), otherwise kept.
-- auth.uid() is NULL when SQL runs without a JWT (for example from the SQL tools); that is allowed.

create function public.set_audit_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := pg_catalog.now();
    new.created_by := auth.uid();
    new.updated_at := pg_catalog.now();
    new.updated_by := auth.uid();
    new.deleted_at := null;
    new.deleted_by := null;
  elsif tg_op = 'UPDATE' then
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.updated_at := pg_catalog.now();
    new.updated_by := auth.uid();
    if new.deleted_at is null then
      new.deleted_by := null;
    elsif old.deleted_at is null then
      new.deleted_by := auth.uid();
    else
      new.deleted_by := old.deleted_by;
    end if;
  end if;
  return new;
end;
$$;

comment on function public.set_audit_columns() is 'Trigger: maintains created_*, updated_* and deleted_by on farmers, usage_entries and payments (D12). Not callable directly.';

-- Trigger functions need no EXECUTE grant to fire. Removing it keeps the function off the public API surface.
revoke all on function public.set_audit_columns() from public, anon, authenticated;

create trigger farmers_set_audit
  before insert or update on public.farmers
  for each row execute function public.set_audit_columns();

create trigger usage_entries_set_audit
  before insert or update on public.usage_entries
  for each row execute function public.set_audit_columns();

create trigger payments_set_audit
  before insert or update on public.payments
  for each row execute function public.set_audit_columns();
