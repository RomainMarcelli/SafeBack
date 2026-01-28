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
  created_at timestamptz default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  from_address text not null,
  to_address text not null,
  expected_arrival_time timestamptz,
  created_at timestamptz default now()
);

alter table sessions add column if not exists expected_arrival_time timestamptz;

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
