-- SafeBack : rapports d'incident (SOS / retard / autre)
-- À exécuter après supabase.align_app.sql

begin;

create table if not exists public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.sessions(id) on delete set null,
  incident_type text not null default 'sos'
    check (incident_type in ('sos', 'delay', 'other')),
  severity text not null default 'medium'
    check (severity in ('low', 'medium', 'high')),
  occurred_at timestamptz not null default now(),
  location_label text,
  latitude double precision,
  longitude double precision,
  details text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists incident_reports_user_occurred_idx
  on public.incident_reports(user_id, occurred_at desc);

create or replace function public.handle_incident_reports_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists incident_reports_set_updated_at on public.incident_reports;
create trigger incident_reports_set_updated_at
before update on public.incident_reports
for each row
execute function public.handle_incident_reports_updated_at();

alter table public.incident_reports enable row level security;

drop policy if exists incident_reports_select on public.incident_reports;
create policy incident_reports_select
on public.incident_reports
for select
using (auth.uid() = user_id);

drop policy if exists incident_reports_insert on public.incident_reports;
create policy incident_reports_insert
on public.incident_reports
for insert
with check (auth.uid() = user_id);

drop policy if exists incident_reports_update on public.incident_reports;
create policy incident_reports_update
on public.incident_reports
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists incident_reports_delete on public.incident_reports;
create policy incident_reports_delete
on public.incident_reports
for delete
using (auth.uid() = user_id);

commit;
