-- Supabase RLS hardening for Aspire Reimbursement.
-- Apply in the Supabase SQL editor for the project used by VITE_SUPABASE_URL.
-- This intentionally blocks anonymous browser CRUD. Add narrower ownership/admin
-- predicates if the app is expanded to multi-user Supabase Auth.

begin;

alter table if exists public.audit_logs enable row level security;
alter table if exists public.reimbursement_logs enable row level security;
alter table if exists public.employees enable row level security;

revoke all on table public.audit_logs from anon;
revoke all on table public.reimbursement_logs from anon;
revoke all on table public.employees from anon;

grant select, insert, update, delete on table public.audit_logs to authenticated;
grant select, insert, update, delete on table public.reimbursement_logs to authenticated;
grant select, insert, update, delete on table public.employees to authenticated;

drop policy if exists "authenticated read audit logs" on public.audit_logs;
drop policy if exists "authenticated insert audit logs" on public.audit_logs;
drop policy if exists "authenticated update audit logs" on public.audit_logs;
drop policy if exists "authenticated delete audit logs" on public.audit_logs;

create policy "authenticated read audit logs"
on public.audit_logs for select
to authenticated
using ((select auth.uid()) is not null);

create policy "authenticated insert audit logs"
on public.audit_logs for insert
to authenticated
with check ((select auth.uid()) is not null);

create policy "authenticated update audit logs"
on public.audit_logs for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

create policy "authenticated delete audit logs"
on public.audit_logs for delete
to authenticated
using ((select auth.uid()) is not null);

drop policy if exists "authenticated read reimbursement logs" on public.reimbursement_logs;
drop policy if exists "authenticated update reimbursement logs" on public.reimbursement_logs;

create policy "authenticated read reimbursement logs"
on public.reimbursement_logs for select
to authenticated
using ((select auth.uid()) is not null);

create policy "authenticated update reimbursement logs"
on public.reimbursement_logs for update
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

drop policy if exists "authenticated read employees" on public.employees;
drop policy if exists "authenticated write employees" on public.employees;

create policy "authenticated read employees"
on public.employees for select
to authenticated
using ((select auth.uid()) is not null);

create policy "authenticated write employees"
on public.employees for all
to authenticated
using ((select auth.uid()) is not null)
with check ((select auth.uid()) is not null);

commit;
