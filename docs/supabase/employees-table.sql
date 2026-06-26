-- Aspire Reimbursement — employees table
-- Run this once in the Supabase SQL Editor for project qxxyzamgwzfdftnncflz
-- (Dashboard → SQL Editor → New query → paste → Run).
--
-- The app (App.tsx: saveEmployeesToSupabase / fetchEmployeesFromSupabase) reads and
-- writes these columns. Account number is the unique identity used for replace-all
-- uploads and de-duplication, so it carries a UNIQUE constraint.

create table if not exists public.employees (
    id          uuid primary key default gen_random_uuid(),
    first_name  text not null default '',
    surname     text not null default '',
    concatenate text,
    bsb         text,
    account     text not null,
    created_at  timestamptz not null default now()
);

-- Unique on account → enables upsert(onConflict:'account') and guarantees no duplicates.
create unique index if not exists employees_account_key on public.employees (account);

-- Helpful for the surname-ordered fetch.
create index if not exists employees_surname_idx on public.employees (surname);

-- Row Level Security: the browser uses the anon key, so allow it full access to this
-- table (same trust model as the rest of this internal auditor tool). Tighten later if
-- the app moves behind real auth.
alter table public.employees enable row level security;

drop policy if exists employees_anon_all on public.employees;
create policy employees_anon_all
    on public.employees
    for all
    to anon, authenticated
    using (true)
    with check (true);
