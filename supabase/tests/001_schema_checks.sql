-- supabase/tests/001_schema_checks.sql
-- Schema, trigger and RLS checks for migrations 001-006 (project tubewell-hisab).
--
-- HOW TO RUN (re-runnable, leaves no data behind):
--   Run SECTION A as one call (Supabase MCP execute_sql or the SQL editor). It is a single
--   transaction that ends with ROLLBACK; its last SELECT prints one PASS/FAIL row per check.
--   T0.01 records the row counts that existed BEFORE the tests (the owner's own rows are never
--   touched or assumed absent).
--   Then run SECTION B as a second call: T6.01 prints the counts again; they must equal T0.01.
-- All data is fictional. Results are collected in the transaction-local setting tw.r, so the
-- checks still record correctly while the session role is switched to anon or authenticated.
-- A logged-in user is simulated with request.jwt.claims plus SET LOCAL ROLE authenticated.
-- SQLSTATEs: 23514 check, 23502 not null, 23503 foreign key, 428C9 generated column,
-- 42501 insufficient privilege or RLS violation, 00000 success.

-- ===================================================================== SECTION A
begin;

select set_config('tw.r', '', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);

-- T0 baseline: row counts before any test row is created (compare with T6.01 after the rollback)
select set_config('tw.r', current_setting('tw.r') || format('T0.01|PASS|baseline row counts before the tests (T6.01 must show the same)|farmers=%s usage_entries=%s payments=%s',
  (select count(*) from public.farmers), (select count(*) from public.usage_entries), (select count(*) from public.payments)) || chr(10), true);

-- T1 constraints and T2 generated column (as the table owner; constraints apply to every role)
do $$
declare
  fid uuid;
  eid uuid;
  c record;
  got text;
  tm integer;
  rp bigint;
begin
  insert into public.farmers (name) values ('T1 Test Kisan') returning id into fid;
  for c in
    select * from (values
      ('T1.01', 'reject empty farmer name', 'insert into public.farmers (name) values ('''')', '23514'),
      ('T1.02', 'reject whitespace-only farmer name', 'insert into public.farmers (name) values (''   '')', '23514'),
      ('T1.03', 'reject null farmer name', 'insert into public.farmers (name) values (null)', '23502'),
      ('T1.04', 'reject hours = -1', 'insert into public.usage_entries (farmer_id, used_at, hours, minutes) values (''{fid}'', now(), -1, 30)', '23514'),
      ('T1.05', 'reject minutes = 60', 'insert into public.usage_entries (farmer_id, used_at, hours, minutes) values (''{fid}'', now(), 1, 60)', '23514'),
      ('T1.06', 'reject minutes = -1', 'insert into public.usage_entries (farmer_id, used_at, hours, minutes) values (''{fid}'', now(), 1, -1)', '23514'),
      ('T1.07', 'reject hours = 0 and minutes = 0', 'insert into public.usage_entries (farmer_id, used_at, hours, minutes) values (''{fid}'', now(), 0, 0)', '23514'),
      ('T1.08', 'reject rate_paise = 0', 'insert into public.usage_entries (farmer_id, used_at, hours, minutes, rate_paise) values (''{fid}'', now(), 1, 0, 0)', '23514'),
      ('T1.09', 'reject rate_paise < 0', 'insert into public.usage_entries (farmer_id, used_at, hours, minutes, rate_paise) values (''{fid}'', now(), 1, 0, -100)', '23514'),
      ('T1.10', 'reject usage without used_at (no default)', 'insert into public.usage_entries (farmer_id, hours, minutes) values (''{fid}'', 1, 0)', '23502'),
      ('T1.11', 'reject usage for unknown farmer_id', 'insert into public.usage_entries (farmer_id, used_at, hours, minutes) values (''00000000-0000-0000-0000-00000000dead'', now(), 1, 0)', '23503'),
      ('T1.12', 'reject direct insert into total_minutes', 'insert into public.usage_entries (farmer_id, used_at, hours, minutes, total_minutes) values (''{fid}'', now(), 1, 0, 60)', '428C9'),
      ('T1.13', 'reject payment amount_paise = 0', 'insert into public.payments (farmer_id, paid_at, amount_paise) values (''{fid}'', now(), 0)', '23514'),
      ('T1.14', 'reject payment amount_paise < 0', 'insert into public.payments (farmer_id, paid_at, amount_paise) values (''{fid}'', now(), -5000)', '23514'),
      ('T1.15', 'reject payment without paid_at (no default)', 'insert into public.payments (farmer_id, amount_paise) values (''{fid}'', 5000)', '23502'),
      ('T1.16', 'reject payment for unknown farmer_id', 'insert into public.payments (farmer_id, paid_at, amount_paise) values (''00000000-0000-0000-0000-00000000dead'', now(), 5000)', '23503'),
      ('T1.17', 'accept valid farmer', 'insert into public.farmers (name, mobile, notes) values (''Test Kisan Valid'', ''9000000000'', ''fictional test row'')', '00000'),
      ('T1.18', 'accept valid usage 3h35 (default rate)', 'insert into public.usage_entries (farmer_id, used_at, hours, minutes) values (''{fid}'', now(), 3, 35)', '00000'),
      ('T1.19', 'accept boundary usage 0h59', 'insert into public.usage_entries (farmer_id, used_at, hours, minutes) values (''{fid}'', now(), 0, 59)', '00000'),
      ('T1.20', 'accept boundary usage 0h01 at rate_paise 1', 'insert into public.usage_entries (farmer_id, used_at, hours, minutes, rate_paise) values (''{fid}'', now(), 0, 1, 1)', '00000'),
      ('T1.21', 'accept valid payment 50000 paise', 'insert into public.payments (farmer_id, paid_at, amount_paise, note) values (''{fid}'', now(), 50000, ''fictional'')', '00000'),
      ('T1.22', 'reject direct update of total_minutes', 'update public.usage_entries set total_minutes = 1 where farmer_id = ''{fid}''', '428C9')
    ) as v(id, label, stmt, want)
    order by id
  loop
    begin
      execute replace(c.stmt, '{fid}', fid::text);
      got := '00000';
    exception when others then
      got := sqlstate;
    end;
    perform set_config('tw.r', current_setting('tw.r') || format('%s|%s|%s|expected %s, got %s', c.id, case when got = c.want then 'PASS' else 'FAIL' end, c.label, c.want, got) || chr(10), true);
  end loop;

  insert into public.usage_entries (farmer_id, used_at, hours, minutes) values (fid, now(), 3, 35)
    returning id, total_minutes, rate_paise into eid, tm, rp;
  perform set_config('tw.r', current_setting('tw.r') || format('T2.01|%s|generated total_minutes for 3h35 is 215|got %s', case when tm = 215 then 'PASS' else 'FAIL' end, tm) || chr(10), true);
  perform set_config('tw.r', current_setting('tw.r') || format('T2.02|%s|rate_paise defaults to 10000|got %s', case when rp = 10000 then 'PASS' else 'FAIL' end, rp) || chr(10), true);
  update public.usage_entries set hours = 4 where id = eid returning total_minutes into tm;
  perform set_config('tw.r', current_setting('tw.r') || format('T2.03|%s|total_minutes recomputed after hours 3 to 4 (275)|got %s', case when tm = 275 then 'PASS' else 'FAIL' end, tm) || chr(10), true);
end $$;

-- T3 audit triggers (as the table owner; the JWT claims decide auth.uid())
do $$
declare
  a1 constant uuid := '00000000-0000-0000-0000-0000000000a1';
  a2 constant uuid := '00000000-0000-0000-0000-0000000000a2';
  forged constant uuid := '00000000-0000-0000-0000-0000000000ff';
  r public.farmers;
  r2 public.farmers;
  u public.usage_entries;
  p public.payments;
begin
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  insert into public.farmers (name, created_at, created_by, updated_at, updated_by, deleted_at, deleted_by)
    values ('T3 Audit Kisan', '2000-01-01', forged, '2000-01-01', forged, '2000-01-01', forged)
    returning * into r;
  perform set_config('tw.r', current_setting('tw.r') || format('T3.01|%s|insert: client created_by ignored, set to auth.uid()|got %s', case when r.created_by = a1 then 'PASS' else 'FAIL' end, r.created_by) || chr(10), true);
  perform set_config('tw.r', current_setting('tw.r') || format('T3.02|%s|insert: client created_at ignored, set to now()|got %s', case when r.created_at = now() then 'PASS' else 'FAIL' end, r.created_at) || chr(10), true);
  perform set_config('tw.r', current_setting('tw.r') || format('T3.03|%s|insert: updated_at = now(), updated_by = auth.uid()|got %s / %s', case when r.updated_at = now() and r.updated_by = a1 then 'PASS' else 'FAIL' end, r.updated_at, r.updated_by) || chr(10), true);
  perform set_config('tw.r', current_setting('tw.r') || format('T3.04|%s|insert: client deleted_at/deleted_by forced to NULL|got %s / %s', case when r.deleted_at is null and r.deleted_by is null then 'PASS' else 'FAIL' end, r.deleted_at, r.deleted_by) || chr(10), true);

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a2","role":"authenticated"}', true);
  update public.farmers
    set name = 'T3 Audit Kisan v2', created_at = '1999-01-01', created_by = forged, updated_at = '2000-01-01', updated_by = forged
    where id = r.id returning * into r2;
  perform set_config('tw.r', current_setting('tw.r') || format('T3.05|%s|update: created_at and created_by immutable|got %s / %s', case when r2.created_at = r.created_at and r2.created_by = a1 then 'PASS' else 'FAIL' end, r2.created_at, r2.created_by) || chr(10), true);
  perform set_config('tw.r', current_setting('tw.r') || format('T3.06|%s|update: updated_by changes to the updating user (a1 to a2)|got %s', case when r2.updated_by = a2 then 'PASS' else 'FAIL' end, r2.updated_by) || chr(10), true);
  perform set_config('tw.r', current_setting('tw.r') || format('T3.07|%s|update: updated_at set by trigger to now(), client value ignored|got %s', case when r2.updated_at = now() and r2.updated_at <> '2000-01-01'::timestamptz then 'PASS' else 'FAIL' end, r2.updated_at) || chr(10), true);

  update public.farmers set deleted_at = now(), deleted_by = forged where id = r.id returning * into r2;
  perform set_config('tw.r', current_setting('tw.r') || format('T3.08|%s|soft delete sets deleted_by = auth.uid() (client value ignored)|got %s', case when r2.deleted_at is not null and r2.deleted_by = a2 then 'PASS' else 'FAIL' end, r2.deleted_by) || chr(10), true);
  update public.farmers set deleted_by = forged where id = r.id returning * into r2;
  perform set_config('tw.r', current_setting('tw.r') || format('T3.09|%s|deleted_by cannot be edited directly while deleted|got %s', case when r2.deleted_by = a2 then 'PASS' else 'FAIL' end, r2.deleted_by) || chr(10), true);

  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
  update public.farmers set deleted_at = null where id = r.id returning * into r2;
  perform set_config('tw.r', current_setting('tw.r') || format('T3.10|%s|restore (deleted_at to NULL) clears deleted_by|got %s / %s', case when r2.deleted_at is null and r2.deleted_by is null then 'PASS' else 'FAIL' end, r2.deleted_at, r2.deleted_by) || chr(10), true);
  update public.farmers set deleted_by = forged where id = r.id returning * into r2;
  perform set_config('tw.r', current_setting('tw.r') || format('T3.11|%s|deleted_by cannot be set directly on a live row|got %s', case when r2.deleted_by is null then 'PASS' else 'FAIL' end, r2.deleted_by) || chr(10), true);

  insert into public.usage_entries (farmer_id, used_at, hours, minutes, created_by, deleted_at)
    values (r.id, now(), 1, 0, forged, now()) returning * into u;
  perform set_config('tw.r', current_setting('tw.r') || format('T3.12|%s|usage_entries trigger: created_by = auth.uid(), deleted_at NULL on insert|got %s / %s', case when u.created_by = a1 and u.deleted_at is null then 'PASS' else 'FAIL' end, u.created_by, u.deleted_at) || chr(10), true);
  update public.usage_entries set deleted_at = now() where id = u.id returning * into u;
  perform set_config('tw.r', current_setting('tw.r') || format('T3.13|%s|usage_entries trigger: soft delete sets deleted_by|got %s', case when u.deleted_by = a1 then 'PASS' else 'FAIL' end, u.deleted_by) || chr(10), true);
  insert into public.payments (farmer_id, paid_at, amount_paise, created_by, created_at)
    values (r.id, now(), 10000, forged, '2000-01-01') returning * into p;
  perform set_config('tw.r', current_setting('tw.r') || format('T3.14|%s|payments trigger: created_by/created_at forced|got %s / %s', case when p.created_by = a1 and p.created_at = now() then 'PASS' else 'FAIL' end, p.created_by, p.created_at) || chr(10), true);

  perform set_config('request.jwt.claims', '', true);
  insert into public.farmers (name) values ('T3 No JWT Kisan') returning * into r;
  perform set_config('tw.r', current_setting('tw.r') || format('T3.15|%s|without a JWT auth.uid() is NULL and the insert still works|got created_by %s', case when r.created_by is null then 'PASS' else 'FAIL' end, coalesce(r.created_by::text, 'NULL')) || chr(10), true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
end $$;

-- T4 foreign keys use ON DELETE RESTRICT (as the table owner, which bypasses RLS and grants)
do $$
declare
  f_u uuid;
  f_p uuid;
  got text;
  n integer;
begin
  insert into public.farmers (name) values ('T4 Kisan With Usage') returning id into f_u;
  insert into public.usage_entries (farmer_id, used_at, hours, minutes) values (f_u, now(), 1, 0);
  insert into public.farmers (name) values ('T4 Kisan With Payment') returning id into f_p;
  insert into public.payments (farmer_id, paid_at, amount_paise) values (f_p, now(), 10000);

  begin
    delete from public.farmers where id = f_u;
    got := '00000';
  exception when others then
    got := sqlstate;
  end;
  perform set_config('tw.r', current_setting('tw.r') || format('T4.01|%s|delete farmer with a usage entry fails (RESTRICT)|expected 23503, got %s', case when got = '23503' then 'PASS' else 'FAIL' end, got) || chr(10), true);

  begin
    delete from public.farmers where id = f_p;
    got := '00000';
  exception when others then
    got := sqlstate;
  end;
  perform set_config('tw.r', current_setting('tw.r') || format('T4.02|%s|delete farmer with a payment fails (RESTRICT)|expected 23503, got %s', case when got = '23503' then 'PASS' else 'FAIL' end, got) || chr(10), true);

  select count(*) into n from pg_catalog.pg_constraint
    where contype = 'f' and confdeltype = 'r'
      and conrelid in ('public.usage_entries'::regclass, 'public.payments'::regclass)
      and confrelid = 'public.farmers'::regclass;
  perform set_config('tw.r', current_setting('tw.r') || format('T4.03|%s|both foreign keys to farmers are ON DELETE RESTRICT|found %s of 2', case when n = 2 then 'PASS' else 'FAIL' end, n) || chr(10), true);
end $$;

-- T5 row level security and privileges (policies locked to the owner uid by migration 004)
-- The owner uid is read from auth.users at run time; it is never written into this file or the output.
do $$
declare
  n integer;
  owner_uid uuid;
  owner_claims text;
  other_claims constant text := '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
  fa uuid;
  fc uuid;
  c record;
  got text;
  rows_got bigint;
  ok boolean;
begin
  select count(*) into n from auth.users;
  perform set_config('tw.r', current_setting('tw.r') || format('T5.00|%s|exactly one auth user (the owner) exists|found %s', case when n = 1 then 'PASS' else 'FAIL' end, n) || chr(10), true);
  select id into owner_uid from auth.users limit 1;
  owner_claims := json_build_object('sub', owner_uid, 'role', 'authenticated')::text;

  select count(*) into n from pg_catalog.pg_class
    where oid in ('public.farmers'::regclass, 'public.usage_entries'::regclass, 'public.payments'::regclass)
      and relrowsecurity;
  perform set_config('tw.r', current_setting('tw.r') || format('T5.01|%s|row level security enabled on all three tables|%s of 3', case when n = 3 then 'PASS' else 'FAIL' end, n) || chr(10), true);
  select count(*) into n from pg_catalog.pg_policies
    where schemaname = 'public' and tablename in ('farmers', 'usage_entries', 'payments') and cmd in ('DELETE', 'ALL');
  perform set_config('tw.r', current_setting('tw.r') || format('T5.02|%s|no DELETE (or ALL) policy exists|found %s', case when n = 0 then 'PASS' else 'FAIL' end, n) || chr(10), true);
  select count(*) into n from pg_catalog.pg_policies
    where schemaname = 'public' and tablename in ('farmers', 'usage_entries', 'payments')
      and roles = '{authenticated}' and policyname like '%\_owner';
  perform set_config('tw.r', current_setting('tw.r') || format('T5.03|%s|9 *_owner policies (select/insert/update x 3 tables), role authenticated only|found %s', case when n = 9 then 'PASS' else 'FAIL' end, n) || chr(10), true);
  select count(*) into n from pg_catalog.pg_policies
    where schemaname = 'public' and tablename in ('farmers', 'usage_entries', 'payments')
      and coalesce(qual, '') || coalesce(with_check, '') like '%' || owner_uid::text || '%'
      and (qual is null or qual like '%' || owner_uid::text || '%')
      and (with_check is null or with_check like '%' || owner_uid::text || '%');
  perform set_config('tw.r', current_setting('tw.r') || format('T5.04|%s|every policy expression is pinned to the owner uid|%s of 9', case when n = 9 then 'PASS' else 'FAIL' end, n) || chr(10), true);
  select count(*) into n from pg_catalog.pg_policies
    where schemaname = 'public' and policyname like '%\_authenticated';
  perform set_config('tw.r', current_setting('tw.r') || format('T5.05|%s|old *_authenticated policies are gone|found %s', case when n = 0 then 'PASS' else 'FAIL' end, n) || chr(10), true);

  insert into public.farmers (name) values ('T5 Kisan A') returning id into fa;
  insert into public.farmers (name) values ('T5 Kisan C') returning id into fc;
  insert into public.usage_entries (farmer_id, used_at, hours, minutes) values (fa, now(), 2, 0);
  insert into public.payments (farmer_id, paid_at, amount_paise) values (fa, now(), 20000);

  for c in
    select * from (values
      ('T5.10', 'anon',      'anon cannot SELECT farmers',            'select 1 from public.farmers', '42501', null::bigint),
      ('T5.11', 'anon',      'anon cannot SELECT usage_entries',      'select 1 from public.usage_entries', '42501', null),
      ('T5.12', 'anon',      'anon cannot SELECT payments',           'select 1 from public.payments', '42501', null),
      ('T5.13', 'anon',      'anon cannot INSERT farmers',            'insert into public.farmers (name) values (''Anon Kisan'')', '42501', null),
      ('T5.14', 'anon',      'anon cannot INSERT payments',           'insert into public.payments (farmer_id, paid_at, amount_paise) values (''{fa}'', now(), 100)', '42501', null),
      ('T5.15', 'anon',      'anon cannot UPDATE farmers',            'update public.farmers set name = name', '42501', null),
      ('T5.20', 'owner',     'owner can SELECT farmers',              'select 1 from public.farmers', '00000', -1),
      ('T5.21', 'owner',     'owner can SELECT usage_entries',        'select 1 from public.usage_entries', '00000', -1),
      ('T5.22', 'owner',     'owner can SELECT payments',             'select 1 from public.payments', '00000', -1),
      ('T5.23', 'owner',     'owner can INSERT farmers',              'insert into public.farmers (name) values (''Owner Kisan'')', '00000', 1),
      ('T5.24', 'owner',     'owner can INSERT usage_entries',        'insert into public.usage_entries (farmer_id, used_at, hours, minutes) values (''{fa}'', now(), 1, 15)', '00000', 1),
      ('T5.25', 'owner',     'owner can INSERT payments',             'insert into public.payments (farmer_id, paid_at, amount_paise) values (''{fa}'', now(), 15000)', '00000', 1),
      ('T5.26', 'owner',     'owner can UPDATE farmers',              'update public.farmers set notes = ''edited'' where id = ''{fa}''', '00000', 1),
      ('T5.27', 'owner',     'owner can soft-delete (UPDATE deleted_at)', 'update public.farmers set deleted_at = now() where id = ''{fc}''', '00000', 1),
      ('T5.28', 'owner',     'owner can restore (UPDATE deleted_at = NULL)', 'update public.farmers set deleted_at = null where id = ''{fc}''', '00000', 1),
      ('T5.29', 'owner',     'owner cannot DELETE farmers',           'delete from public.farmers where id = ''{fc}''', '42501', null),
      ('T5.30', 'owner',     'owner cannot DELETE usage_entries',     'delete from public.usage_entries', '42501', null),
      ('T5.31', 'owner',     'owner cannot DELETE payments',          'delete from public.payments', '42501', null),
      ('T5.32', 'owner',     'owner cannot TRUNCATE payments',        'truncate public.payments', '42501', null),
      ('T5.40', 'auth_nosub','authenticated without auth.uid() sees 0 farmers', 'select 1 from public.farmers', '00000', 0),
      ('T5.41', 'auth_nosub','authenticated without auth.uid() cannot INSERT', 'insert into public.farmers (name) values (''No Sub Kisan'')', '42501', null),
      ('T5.42', 'auth_nosub','authenticated without auth.uid() updates 0 rows', 'update public.farmers set notes = ''x''', '00000', 0),
      ('T5.50', 'other',     'another authenticated uid sees 0 farmers', 'select 1 from public.farmers', '00000', 0),
      ('T5.51', 'other',     'another authenticated uid sees 0 usage_entries', 'select 1 from public.usage_entries', '00000', 0),
      ('T5.52', 'other',     'another authenticated uid sees 0 payments', 'select 1 from public.payments', '00000', 0),
      ('T5.53', 'other',     'another authenticated uid cannot INSERT farmers', 'insert into public.farmers (name) values (''Other Kisan'')', '42501', null),
      ('T5.54', 'other',     'another authenticated uid cannot INSERT payments', 'insert into public.payments (farmer_id, paid_at, amount_paise) values (''{fa}'', now(), 100)', '42501', null),
      ('T5.55', 'other',     'another authenticated uid updates 0 farmers', 'update public.farmers set notes = ''hijack'' where id = ''{fa}''', '00000', 0),
      ('T5.56', 'other',     'another authenticated uid updates 0 payments', 'update public.payments set amount_paise = 1', '00000', 0),
      ('T5.57', 'other',     'another authenticated uid cannot DELETE farmers', 'delete from public.farmers', '42501', null)
    ) as v(id, who, label, stmt, want, want_rows)
    order by id
  loop
    if c.who = 'anon' then
      perform set_config('request.jwt.claims', '', true);
      set local role anon;
    elsif c.who = 'owner' then
      perform set_config('request.jwt.claims', owner_claims, true);
      set local role authenticated;
    elsif c.who = 'other' then
      perform set_config('request.jwt.claims', other_claims, true);
      set local role authenticated;
    else
      perform set_config('request.jwt.claims', '{"role":"authenticated"}', true);
      set local role authenticated;
    end if;

    rows_got := null;
    begin
      execute replace(replace(c.stmt, '{fa}', fa::text), '{fc}', fc::text);
      get diagnostics rows_got = row_count;
      got := '00000';
    exception when others then
      got := sqlstate;
    end;
    reset role;

    ok := got = c.want and (c.want_rows is null
                            or (c.want_rows = -1 and rows_got > 0)
                            or (c.want_rows >= 0 and rows_got = c.want_rows));
    perform set_config('tw.r', current_setting('tw.r') || format('%s|%s|%s|expected %s%s, got %s%s',
      c.id, case when ok then 'PASS' else 'FAIL' end, c.label, c.want,
      case when c.want_rows is null then '' when c.want_rows = -1 then ' rows>0' else ' rows=' || c.want_rows end,
      got, case when rows_got is null then '' else ' rows=' || rows_got end) || chr(10), true);
  end loop;

  select count(*) into n from public.farmers where notes = 'hijack';
  perform set_config('tw.r', current_setting('tw.r') || format('T5.58|%s|no row was changed by the other uid|found %s hijacked rows', case when n = 0 then 'PASS' else 'FAIL' end, n) || chr(10), true);
  perform set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
end $$;

-- T7 farmers input checks from migration 005 (as the table owner; constraints apply to every role)
-- Whitespace characters are built with chr() so this file stays pure ASCII.
do $$
declare
  fid uuid;
  c record;
  got text;
begin
  insert into public.farmers (name) values ('T7 Kisan') returning id into fid;
  for c in
    select * from (values
      ('T7.01', 'reject space-only name', 'insert into public.farmers (name) values (''  '')', '23514'),
      ('T7.02', 'reject tab-only name', 'insert into public.farmers (name) values (chr(9))', '23514'),
      ('T7.03', 'reject LF-only name', 'insert into public.farmers (name) values (chr(10))', '23514'),
      ('T7.04', 'reject CR-only name', 'insert into public.farmers (name) values (chr(13))', '23514'),
      ('T7.05', 'reject NBSP-only name (U+00A0)', 'insert into public.farmers (name) values (chr(160))', '23514'),
      ('T7.06', 'reject VT-only name', 'insert into public.farmers (name) values (chr(11))', '23514'),
      ('T7.07', 'reject FF-only name', 'insert into public.farmers (name) values (chr(12))', '23514'),
      ('T7.08', 'reject mixed whitespace name', 'insert into public.farmers (name) values ('' '' || chr(9) || chr(160) || chr(10) || chr(13) || '' '')', '23514'),
      ('T7.09', 'reject update of a name to tab-only', 'update public.farmers set name = chr(9) where id = ''{fid}''', '23514'),
      ('T7.10', 'accept 100-character name', 'insert into public.farmers (name) values (repeat(''a'', 100))', '00000'),
      ('T7.11', 'reject 101-character name', 'insert into public.farmers (name) values (repeat(''a'', 101))', '23514'),
      ('T7.12', 'accept 20-character mobile', 'insert into public.farmers (name, mobile) values (''T7 Mobile 20'', repeat(''9'', 20))', '00000'),
      ('T7.13', 'reject 21-character mobile', 'insert into public.farmers (name, mobile) values (''T7 Mobile 21'', repeat(''9'', 21))', '23514'),
      ('T7.14', 'accept 500-character notes', 'insert into public.farmers (name, notes) values (''T7 Notes 500'', repeat(''n'', 500))', '00000'),
      ('T7.15', 'reject 501-character notes', 'insert into public.farmers (name, notes) values (''T7 Notes 501'', repeat(''n'', 501))', '23514'),
      ('T7.16', 'accept NULL mobile and NULL notes', 'insert into public.farmers (name, mobile, notes) values (''T7 Nulls'', null, null)', '00000'),
      ('T7.17', 'accept a Devanagari name', 'insert into public.farmers (name) values (chr(2352) || chr(2366) || chr(2350) || '' '' || chr(2354) || chr(2366) || chr(2354))', '00000'),
      ('T7.18', 'accept a name with inner spaces', 'insert into public.farmers (name) values (''Test  Kisan  Lal'')', '00000'),
      ('T7.19', 'accept a 100-character Devanagari name (characters, not bytes)', 'insert into public.farmers (name) values (repeat(chr(2352), 100))', '00000'),
      ('T7.20', 'reject a 101-character Devanagari name', 'insert into public.farmers (name) values (repeat(chr(2352), 101))', '23514')
    ) as v(id, label, stmt, want)
    order by id
  loop
    begin
      execute replace(c.stmt, '{fid}', fid::text);
      got := '00000';
    exception when others then
      got := sqlstate;
    end;
    perform set_config('tw.r', current_setting('tw.r') || format('%s|%s|%s|expected %s, got %s', c.id, case when got = c.want then 'PASS' else 'FAIL' end, c.label, c.want, got) || chr(10), true);
  end loop;
end $$;

-- T8 payments note length from migration 006, and the amount check (as the table owner)
-- Devanagari text is built with chr() so this file stays pure ASCII.
do $$
declare
  fid uuid;
  pid uuid;
  c record;
  got text;
  n integer;
begin
  insert into public.farmers (name) values ('T8 Kisan') returning id into fid;
  insert into public.payments (farmer_id, paid_at, amount_paise) values (fid, now(), 10000) returning id into pid;
  for c in
    select * from (values
      ('T8.01', 'accept a 200-character note', 'insert into public.payments (farmer_id, paid_at, amount_paise, note) values (''{fid}'', now(), 100, repeat(''n'', 200))', '00000'),
      ('T8.02', 'reject a 201-character note', 'insert into public.payments (farmer_id, paid_at, amount_paise, note) values (''{fid}'', now(), 100, repeat(''n'', 201))', '23514'),
      ('T8.03', 'accept a NULL note', 'insert into public.payments (farmer_id, paid_at, amount_paise, note) values (''{fid}'', now(), 100, null)', '00000'),
      ('T8.04', 'accept a Devanagari note', 'insert into public.payments (farmer_id, paid_at, amount_paise, note) values (''{fid}'', now(), 100, chr(2346) || chr(2376) || chr(2360) || chr(2366))', '00000'),
      ('T8.05', 'accept a 200-character Devanagari note (characters, not bytes)', 'insert into public.payments (farmer_id, paid_at, amount_paise, note) values (''{fid}'', now(), 100, repeat(chr(2346), 200))', '00000'),
      ('T8.06', 'reject a 201-character Devanagari note', 'insert into public.payments (farmer_id, paid_at, amount_paise, note) values (''{fid}'', now(), 100, repeat(chr(2346), 201))', '23514'),
      ('T8.07', 'reject an update of a note to 201 characters', 'update public.payments set note = repeat(''n'', 201) where id = ''{pid}''', '23514'),
      ('T8.08', 'still reject amount_paise = 0', 'insert into public.payments (farmer_id, paid_at, amount_paise) values (''{fid}'', now(), 0)', '23514'),
      ('T8.09', 'still reject amount_paise < 0', 'insert into public.payments (farmer_id, paid_at, amount_paise) values (''{fid}'', now(), -1)', '23514')
    ) as v(id, label, stmt, want)
    order by id
  loop
    begin
      execute replace(replace(c.stmt, '{fid}', fid::text), '{pid}', pid::text);
      got := '00000';
    exception when others then
      got := sqlstate;
    end;
    perform set_config('tw.r', current_setting('tw.r') || format('%s|%s|%s|expected %s, got %s', c.id, case when got = c.want then 'PASS' else 'FAIL' end, c.label, c.want, got) || chr(10), true);
  end loop;

  select count(*) into n from pg_catalog.pg_constraint
    where conrelid = 'public.payments'::regclass and conname = 'payments_note_max_length' and contype = 'c';
  perform set_config('tw.r', current_setting('tw.r') || format('T8.10|%s|constraint payments_note_max_length exists|found %s', case when n = 1 then 'PASS' else 'FAIL' end, n) || chr(10), true);
end $$;

with r as (
  select split_part(l, '|', 1) as test, split_part(l, '|', 2) as result,
         split_part(l, '|', 3) as check_name, split_part(l, '|', 4) as detail
  from regexp_split_to_table(rtrim(current_setting('tw.r'), chr(10)), chr(10)) as l
)
select test, result, check_name, detail from r
union all
select 'ZZ.TOTAL',
       case when count(*) filter (where result <> 'PASS') = 0 then 'PASS' else 'FAIL' end,
       count(*) filter (where result = 'PASS') || ' passed of ' || count(*) || ' checks',
       'section A rolls back next'
from r
order by 1;

rollback;

-- ===================================================================== SECTION B
-- T6: no residue. Run after SECTION A (separate call). Read-only.
-- PASS only when the detail equals the T0.01 baseline printed by SECTION A (compare the two lines).
select 'T6.01' as test,
       'COMPARE' as result,
       'row counts after the rolled-back tests (must equal T0.01)' as check_name,
       format('farmers=%s usage_entries=%s payments=%s', f, u, p) as detail
from (select (select count(*) from public.farmers) as f,
             (select count(*) from public.usage_entries) as u,
             (select count(*) from public.payments) as p) as counts;
