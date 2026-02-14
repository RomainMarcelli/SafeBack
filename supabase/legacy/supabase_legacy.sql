create type contact_channel as enum ('sms', 'whatsapp', 'call');

create table if not exists favorite_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  label text not null,
  address text not null,
  created_at timestamptz default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  name text not null,
  channel contact_channel not null default 'sms',
  phone text,
  email text,
  contact_group text not null default 'friends',
  created_at timestamptz default now()
);

alter table contacts add column if not exists email text;
alter table contacts add column if not exists contact_group text not null default 'friends';
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_contact_group_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table contacts
      add constraint contacts_contact_group_check
      check (contact_group in ('family', 'colleagues', 'friends'));
  end if;
end
$$;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  from_address text not null,
  to_address text not null,
  expected_arrival_time timestamptz,
  share_live boolean not null default false,
  share_token text,
  created_at timestamptz default now()
);

alter table sessions add column if not exists expected_arrival_time timestamptz;
alter table sessions add column if not exists share_live boolean not null default false;
alter table sessions add column if not exists share_token text;
create unique index if not exists sessions_share_token_idx on sessions(share_token) where share_token is not null;

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text,
  first_name text,
  last_name text,
  phone text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table profiles alter column user_id set default auth.uid();

alter table profiles enable row level security;

create policy profiles_owner on profiles
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists session_contacts (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  created_at timestamptz default now(),
  unique (session_id, contact_id)
);

create table if not exists locations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision,
  recorded_at timestamptz default now()
);

alter table favorite_addresses enable row level security;
alter table contacts enable row level security;
alter table sessions enable row level security;
alter table session_contacts enable row level security;
alter table locations enable row level security;

create policy favorite_addresses_owner on favorite_addresses
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy contacts_owner on contacts
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy sessions_owner on sessions
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy session_contacts_owner on session_contacts
  for all using (
    exists (
      select 1 from sessions s
      where s.id = session_contacts.session_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sessions s
      where s.id = session_contacts.session_id
        and s.user_id = auth.uid()
    )
  );

create policy locations_owner on locations
  for all using (
    exists (
      select 1 from sessions s
      where s.id = locations.session_id
        and s.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sessions s
      where s.id = locations.session_id
        and s.user_id = auth.uid()
    )
  );

create or replace function get_shared_session_snapshot(p_session_id uuid, p_share_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s sessions%rowtype;
  locs jsonb;
begin
  select * into s
  from sessions
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
  from locations l
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

grant execute on function get_shared_session_snapshot(uuid, text) to anon, authenticated;

-- Puis exécuter :
-- 1) supabase.messaging_notifications.sql
-- 2) supabase.social_graph.sql
