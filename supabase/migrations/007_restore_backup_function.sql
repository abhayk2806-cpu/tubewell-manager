-- Migration 007: controlled restore of a backup file (Phase 8, decision D31)
--
-- public.restore_backup(p_payload jsonb, p_mode text) returns jsonb
--   p_mode 'merge':   upsert every row of the file by id (farmers first, then usage_entries and
--                     payments) so each row equals the file's row; never deletes; rows that exist
--                     only in the database stay.
--   p_mode 'replace': delete payments, then usage_entries, then farmers (children before parents),
--                     then insert the file's rows (farmers first). The tables become exactly the file.
-- The call is ONE transaction: any error (bad payload, foreign key, constraint, duplicate id) rolls
-- everything back, so a failed Replace can never leave half-wiped data.
--
-- Audit columns: the audit triggers from 002 would force created_* / updated_* to now() and
-- deleted_at to NULL on insert (bringing soft-deleted rows back to life). The function therefore
-- disables the three audit triggers inside its own transaction and enables them again before it
-- returns, so every column of the file is kept exactly (deleted_at, deleted_by, created_*, updated_*).
-- If the call fails, the trigger change is rolled back with everything else.
--
-- Security: the app has no DELETE policy or grant (D11); this function is the ONLY code path that
-- can delete rows. SECURITY DEFINER with an empty search_path and schema-qualified names; it raises
-- 42501 unless auth.uid() is the single auth user (the owner, same rule as migration 004).
-- EXECUTE is revoked from public and anon and granted to authenticated only. Invalid input raises
-- 22023. The function does not re-implement the ledger: it only copies rows.

create function public.restore_backup(p_payload jsonb, p_mode text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  user_count integer;
  t text;
  required text[];
  del_f bigint := 0;
  del_u bigint := 0;
  del_p bigint := 0;
  ins_f bigint := 0;
  ins_u bigint := 0;
  ins_p bigint := 0;
  upd_f bigint := 0;
  upd_u bigint := 0;
  upd_p bigint := 0;
begin
  -- Owner check (same rule as migration 004: exactly one auth user, and it is the caller).
  select count(*) into user_count from auth.users;
  if caller is null or user_count <> 1 or not exists (select 1 from auth.users u where u.id = caller) then
    raise exception 'restore_backup: only the owner may restore' using errcode = '42501';
  end if;

  if p_mode is null or p_mode not in ('merge', 'replace') then
    raise exception 'restore_backup: mode must be merge or replace' using errcode = '22023';
  end if;

  -- Payload shape (the app validates the file fully before calling; this is the database's own guard).
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception 'restore_backup: payload must be a JSON object' using errcode = '22023';
  end if;
  if p_payload ->> 'format' is distinct from 'tubewell-hisab-backup' or p_payload -> 'version' is distinct from '1'::jsonb then
    raise exception 'restore_backup: payload must be format tubewell-hisab-backup version 1' using errcode = '22023';
  end if;
  foreach t in array array['farmers', 'usage_entries', 'payments'] loop
    if pg_catalog.jsonb_typeof(p_payload -> t) is distinct from 'array' then
      raise exception 'restore_backup: % must be an array', t using errcode = '22023';
    end if;
    required := case t
      when 'farmers' then array['id', 'name', 'is_disabled', 'created_at', 'updated_at']
      when 'usage_entries' then array['id', 'farmer_id', 'used_at', 'hours', 'minutes', 'rate_paise', 'created_at', 'updated_at']
      else array['id', 'farmer_id', 'paid_at', 'amount_paise', 'created_at', 'updated_at']
    end;
    if exists (
      select 1 from pg_catalog.jsonb_array_elements(p_payload -> t) as e(v)
      where pg_catalog.jsonb_typeof(e.v) <> 'object' or not (e.v ?& required)
    ) then
      raise exception 'restore_backup: every % row must be an object with %', t, pg_catalog.array_to_string(required, ', ') using errcode = '22023';
    end if;
    if p_payload -> 'counts' -> t is distinct from pg_catalog.to_jsonb(pg_catalog.jsonb_array_length(p_payload -> t)) then
      raise exception 'restore_backup: counts.% does not match the number of % rows', t, t using errcode = '22023';
    end if;
  end loop;

  -- Keep every column of the file: the audit triggers stay off only inside this transaction.
  alter table public.farmers disable trigger farmers_set_audit;
  alter table public.usage_entries disable trigger usage_entries_set_audit;
  alter table public.payments disable trigger payments_set_audit;

  if p_mode = 'replace' then
    -- Children before parents (explicit order; the foreign keys are ON DELETE RESTRICT).
    delete from public.payments where id is not null;
    get diagnostics del_p = row_count;
    delete from public.usage_entries where id is not null;
    get diagnostics del_u = row_count;
    delete from public.farmers where id is not null;
    get diagnostics del_f = row_count;
  end if;

  -- Farmers first, then their usage entries and payments. Inserted rows return xmax = 0; rows that
  -- differ are updated; rows already equal to the file are not touched (the WHERE skips them).
  with up as (
    insert into public.farmers as d (id, name, mobile, notes, is_disabled, created_at, created_by, updated_at, updated_by, deleted_at, deleted_by)
    select r.id, r.name, r.mobile, r.notes, r.is_disabled, r.created_at, r.created_by, r.updated_at, r.updated_by, r.deleted_at, r.deleted_by
    from pg_catalog.jsonb_populate_recordset(null::public.farmers, p_payload -> 'farmers') as r
    on conflict (id) do update set
      name = excluded.name, mobile = excluded.mobile, notes = excluded.notes, is_disabled = excluded.is_disabled,
      created_at = excluded.created_at, created_by = excluded.created_by, updated_at = excluded.updated_at,
      updated_by = excluded.updated_by, deleted_at = excluded.deleted_at, deleted_by = excluded.deleted_by
    where (d.name, d.mobile, d.notes, d.is_disabled, d.created_at, d.created_by, d.updated_at, d.updated_by, d.deleted_at, d.deleted_by)
      is distinct from
      (excluded.name, excluded.mobile, excluded.notes, excluded.is_disabled, excluded.created_at, excluded.created_by,
       excluded.updated_at, excluded.updated_by, excluded.deleted_at, excluded.deleted_by)
    returning (d.xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into ins_f, upd_f from up;

  with up as (
    insert into public.usage_entries as d (id, farmer_id, used_at, hours, minutes, rate_paise, created_at, created_by, updated_at, updated_by, deleted_at, deleted_by)
    select r.id, r.farmer_id, r.used_at, r.hours, r.minutes, r.rate_paise, r.created_at, r.created_by, r.updated_at, r.updated_by, r.deleted_at, r.deleted_by
    from pg_catalog.jsonb_populate_recordset(null::public.usage_entries, p_payload -> 'usage_entries') as r
    on conflict (id) do update set
      farmer_id = excluded.farmer_id, used_at = excluded.used_at, hours = excluded.hours, minutes = excluded.minutes,
      rate_paise = excluded.rate_paise, created_at = excluded.created_at, created_by = excluded.created_by,
      updated_at = excluded.updated_at, updated_by = excluded.updated_by, deleted_at = excluded.deleted_at, deleted_by = excluded.deleted_by
    where (d.farmer_id, d.used_at, d.hours, d.minutes, d.rate_paise, d.created_at, d.created_by, d.updated_at, d.updated_by, d.deleted_at, d.deleted_by)
      is distinct from
      (excluded.farmer_id, excluded.used_at, excluded.hours, excluded.minutes, excluded.rate_paise, excluded.created_at,
       excluded.created_by, excluded.updated_at, excluded.updated_by, excluded.deleted_at, excluded.deleted_by)
    returning (d.xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into ins_u, upd_u from up;

  with up as (
    insert into public.payments as d (id, farmer_id, paid_at, amount_paise, note, created_at, created_by, updated_at, updated_by, deleted_at, deleted_by)
    select r.id, r.farmer_id, r.paid_at, r.amount_paise, r.note, r.created_at, r.created_by, r.updated_at, r.updated_by, r.deleted_at, r.deleted_by
    from pg_catalog.jsonb_populate_recordset(null::public.payments, p_payload -> 'payments') as r
    on conflict (id) do update set
      farmer_id = excluded.farmer_id, paid_at = excluded.paid_at, amount_paise = excluded.amount_paise, note = excluded.note,
      created_at = excluded.created_at, created_by = excluded.created_by, updated_at = excluded.updated_at,
      updated_by = excluded.updated_by, deleted_at = excluded.deleted_at, deleted_by = excluded.deleted_by
    where (d.farmer_id, d.paid_at, d.amount_paise, d.note, d.created_at, d.created_by, d.updated_at, d.updated_by, d.deleted_at, d.deleted_by)
      is distinct from
      (excluded.farmer_id, excluded.paid_at, excluded.amount_paise, excluded.note, excluded.created_at, excluded.created_by,
       excluded.updated_at, excluded.updated_by, excluded.deleted_at, excluded.deleted_by)
    returning (d.xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into ins_p, upd_p from up;

  alter table public.farmers enable trigger farmers_set_audit;
  alter table public.usage_entries enable trigger usage_entries_set_audit;
  alter table public.payments enable trigger payments_set_audit;

  return pg_catalog.jsonb_build_object(
    'mode', p_mode,
    'deleted', pg_catalog.jsonb_build_object('payments', del_p, 'usage_entries', del_u, 'farmers', del_f),
    'inserted', pg_catalog.jsonb_build_object('farmers', ins_f, 'usage_entries', ins_u, 'payments', ins_p),
    'updated', pg_catalog.jsonb_build_object('farmers', upd_f, 'usage_entries', upd_u, 'payments', upd_p)
  );
end;
$$;

comment on function public.restore_backup(jsonb, text) is 'Restore a tubewell-hisab-backup v1 file in ONE transaction: merge (upsert by id, never deletes) or replace (delete children before parents, then insert). Owner only (42501). Keeps every column of the file, including deleted_at and the audit columns (D31).';

revoke all on function public.restore_backup(jsonb, text) from public, anon;
grant execute on function public.restore_backup(jsonb, text) to authenticated;
