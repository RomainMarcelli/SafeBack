-- Align Supabase schema with SafeBack app features
-- Run this script in Supabase SQL Editor (or migration runner)

begin;

create extension if not exists pgcrypto with schema public;

-- Enum used by contacts.channel
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'contact_channel' and n.nspname = 'public'
  ) then
    create type public.contact_channel as enum ('sms', 'whatsapp', 'call');
  end if;
end
$$;

-- Base tables (safe if already present)
create table if not exists public.favorite_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,
  address text not null,
  created_at timestamptz default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  channel public.contact_channel not null default 'sms',
  phone text,
  email text,
  contact_group text not null default 'friends',
  created_at timestamptz default now()
);

alter table public.contacts add column if not exists email text;
alter table public.contacts add column if not exists contact_group text not null default 'friends';
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_contact_group_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_contact_group_check
      check (contact_group in ('family', 'colleagues', 'friends'));
  end if;
end
$$;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_address text not null,
  to_address text not null,
  expected_arrival_time timestamptz,
  share_live boolean not null default false,
  share_token text,
  created_at timestamptz default now()
);

create table if not exists public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  username text,
  first_name text,
  last_name text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.session_contacts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  created_at timestamptz default now(),
  unique (session_id, contact_id)
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision,
  recorded_at timestamptz default now()
);

-- Columns required by app logic
alter table public.sessions add column if not exists expected_arrival_time timestamptz;
alter table public.sessions add column if not exists share_live boolean not null default false;
alter table public.sessions add column if not exists share_token text;

update public.sessions set share_live = false where share_live is null;
alter table public.sessions alter column share_live set not null;

-- Data quality checks
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'locations_latitude_check'
      and conrelid = 'public.locations'::regclass
  ) then
    alter table public.locations
      add constraint locations_latitude_check check (latitude >= -90 and latitude <= 90);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'locations_longitude_check'
      and conrelid = 'public.locations'::regclass
  ) then
    alter table public.locations
      add constraint locations_longitude_check check (longitude >= -180 and longitude <= 180);
  end if;
end
$$;

-- Useful indexes
create unique index if not exists sessions_share_token_idx
  on public.sessions(share_token)
  where share_token is not null;

create index if not exists sessions_user_created_idx
  on public.sessions(user_id, created_at desc);

create index if not exists contacts_user_created_idx
  on public.contacts(user_id, created_at desc);

create index if not exists favorite_addresses_user_created_idx
  on public.favorite_addresses(user_id, created_at desc);

create index if not exists session_contacts_session_idx
  on public.session_contacts(session_id);

create index if not exists session_contacts_contact_idx
  on public.session_contacts(contact_id);

create index if not exists locations_session_recorded_idx
  on public.locations(session_id, recorded_at asc);

-- Keep profiles.updated_at consistent
create or replace function public.handle_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.handle_profiles_updated_at();

-- RLS
alter table public.favorite_addresses enable row level security;
alter table public.contacts enable row level security;
alter table public.sessions enable row level security;
alter table public.session_contacts enable row level security;
alter table public.locations enable row level security;
alter table public.profiles enable row level security;

drop policy if exists favorite_addresses_owner on public.favorite_addresses;
create policy favorite_addresses_owner
on public.favorite_addresses
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists contacts_owner on public.contacts;
create policy contacts_owner
on public.contacts
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists sessions_owner on public.sessions;
create policy sessions_owner
on public.sessions
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists profiles_owner on public.profiles;
create policy profiles_owner
on public.profiles
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists session_contacts_owner on public.session_contacts;
create policy session_contacts_owner
on public.session_contacts
for all
using (
  exists (
    select 1
    from public.sessions s
    where s.id = session_contacts.session_id
      and s.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.contacts c
    where c.id = session_contacts.contact_id
      and c.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.sessions s
    where s.id = session_contacts.session_id
      and s.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.contacts c
    where c.id = session_contacts.contact_id
      and c.user_id = auth.uid()
  )
);

drop policy if exists locations_owner on public.locations;
create policy locations_owner
on public.locations
for all
using (
  exists (
    select 1
    from public.sessions s
    where s.id = locations.session_id
      and s.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.sessions s
    where s.id = locations.session_id
      and s.user_id = auth.uid()
  )
);

-- RPC used by friend-view link without requiring auth session
create or replace function public.get_shared_session_snapshot(
  p_session_id uuid,
  p_share_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.sessions%rowtype;
  locs jsonb;
begin
  select *
  into s
  from public.sessions
  where id = p_session_id
    and share_live = true
    and share_token = p_share_token;

  if not found then
    return null;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'latitude', l.latitude,
        'longitude', l.longitude,
        'recordedAt', l.recorded_at
      )
      order by l.recorded_at asc
    ),
    '[]'::jsonb
  )
  into locs
  from public.locations l
  where l.session_id = s.id;

  return jsonb_build_object(
    'session_id', s.id,
    'from_address', s.from_address,
    'to_address', s.to_address,
    'expected_arrival_time', s.expected_arrival_time,
    'points', locs
  );
end;
$$;

grant execute on function public.get_shared_session_snapshot(uuid, text)
to anon, authenticated;

-- For messaging / in-app notifications, run:
-- supabase.messaging_notifications.sql
-- For social graph (public ID + friend requests + friendships), run:
-- supabase.social_graph.sql

commit;
