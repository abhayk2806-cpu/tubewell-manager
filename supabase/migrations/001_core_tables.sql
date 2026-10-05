-- Migration 001: core ledger tables (Tubewell Manager rebuild, project tubewell-hisab)
--
-- Only raw facts are stored: farmers, usage entries and payments.
-- Nothing derived is stored: no month text, totals, balances, allocations or
-- per-entry money amounts. The TypeScript ledger engine derives all of that
-- (docs/LEDGER_AND_ALLOCATION.md, rules L1 and D7).
-- Money is integer paise (bigint). Timestamps are timestamptz; the IST month and
-- day logic lives in the app's single shared time function, never in SQL.
-- Soft delete only: a row is deleted when deleted_at is not null.

create table public.farmers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  mobile      text,
  notes       text,
  is_disabled boolean not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  deleted_at  timestamptz,
  deleted_by  uuid,
  constraint farmers_name_not_blank check (length(btrim(name)) > 0)
);

create table public.usage_entries (
  id            uuid primary key default gen_random_uuid(),
  farmer_id     uuid not null references public.farmers (id) on delete restrict,
  used_at       timestamptz not null,
  hours         integer not null,
  minutes       integer not null,
  total_minutes integer generated always as (hours * 60 + minutes) stored,
  rate_paise    bigint not null default 10000,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz,
  deleted_by    uuid,
  constraint usage_entries_hours_nonnegative check (hours >= 0),
  constraint usage_entries_minutes_range check (minutes between 0 and 59),
  constraint usage_entries_duration_positive check (hours * 60 + minutes > 0),
  constraint usage_entries_rate_positive check (rate_paise > 0)
);

create table public.payments (
  id           uuid primary key default gen_random_uuid(),
  farmer_id    uuid not null references public.farmers (id) on delete restrict,
  paid_at      timestamptz not null,
  amount_paise bigint not null,
  note         text,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,
  deleted_at   timestamptz,
  deleted_by   uuid,
  constraint payments_amount_positive check (amount_paise > 0)
);

-- Partial indexes matching how the data layer reads live (not soft-deleted) rows.
create index usage_entries_farmer_used_at_live_idx on public.usage_entries (farmer_id, used_at) where deleted_at is null;
create index usage_entries_used_at_live_idx on public.usage_entries (used_at) where deleted_at is null;
create index payments_farmer_paid_at_live_idx on public.payments (farmer_id, paid_at) where deleted_at is null;
create index payments_paid_at_live_idx on public.payments (paid_at) where deleted_at is null;

comment on table public.farmers is 'Farmers who buy tubewell water. Soft delete only (deleted_at); is_disabled is a separate, restorable pause. Deleted or disabled farmers are excluded from every list and total by the app data layer (ledger rule L12).';
comment on column public.farmers.is_disabled is 'Temporary pause; restorable. Independent of soft delete.';
comment on column public.farmers.deleted_at is 'Soft delete: non-null means deleted. Rows are never hard-deleted by the app.';
comment on column public.farmers.created_by is 'auth.uid() of the creator, set by trigger. Plain uuid with no foreign key, so the audit trail survives user deletion (D9).';

comment on table public.usage_entries is 'One tubewell run for one farmer. The charge is NOT stored: the ledger engine computes amount_paise = floor((2*total_minutes*rate_paise + 60) / 120) (ledger rule L2, D7).';
comment on column public.usage_entries.used_at is 'When the water was used (timestamptz). The app always sends it; the IST month and day are derived in the app.';
comment on column public.usage_entries.total_minutes is 'Generated: hours*60 + minutes. Cannot be written directly.';
comment on column public.usage_entries.rate_paise is 'Rate per hour in integer paise (10000 = Rs 100.00/hour), stored per entry so rate changes never rewrite history.';
comment on column public.usage_entries.deleted_at is 'Soft delete: non-null means deleted.';

comment on table public.payments is 'Money received from a farmer. No month column: payments are allocated FIFO by the ledger engine (ledger rules L5 and L6).';
comment on column public.payments.paid_at is 'When the money was actually received (timestamptz). The app always sends it.';
comment on column public.payments.amount_paise is 'Amount in integer paise (50000 = Rs 500.00). Must be > 0.';
comment on column public.payments.deleted_at is 'Soft delete: non-null means deleted.';
