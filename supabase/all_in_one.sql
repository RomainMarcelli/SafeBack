-- SafeBack: script SQL unique (all-in-one)
-- Ce fichier regroupe toutes les migrations actives dans l'ordre d'execution recommande.
-- Source de verite: fichiers individuels dans supabase/migrations/.
-- Si vous executez ce fichier, n'executer PAS les migrations individuelles en plus.


-- ============================================================================
-- Migration 001: supabase/migrations/001_align_app.sql
-- ============================================================================

-- Aligne le schéma Supabase avec les fonctionnalités de l'app SafeBack
-- Exécuter ce script dans Supabase SQL Editor (ou votre runner de migrations)

begin;

create extension if not exists pgcrypto with schema public;

-- Enum utilisé par contacts.channel
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

-- Tables de base (sans risque si déjà présentes)
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
  allow_guardian_check_requests boolean not null default false,
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

-- Colonnes requises par la logique applicative
alter table public.sessions add column if not exists expected_arrival_time timestamptz;
alter table public.sessions add column if not exists share_live boolean not null default false;
alter table public.sessions add column if not exists share_token text;
alter table public.profiles add column if not exists allow_guardian_check_requests boolean not null default false;

update public.sessions set share_live = false where share_live is null;
alter table public.sessions alter column share_live set not null;

-- Contrôles de qualité des données
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

-- Index utiles
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

-- Maintient profiles.updated_at cohérent
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

-- RPC utilisé par le lien friend-view sans session d'authentification active
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

-- Pour la messagerie / notifications in-app, exécuter :
-- supabase.messaging_notifications.sql
-- Pour le graphe social (ID public + demandes d'ami + amitiés), exécuter :
-- supabase.social_graph.sql

commit;

-- ============================================================================
-- Migration 002: supabase/migrations/002_messaging_notifications.sql
-- ============================================================================

-- Schéma SafeBack pour messagerie + notifications
-- À exécuter après supabase.align_app.sql

begin;

create extension if not exists pgcrypto with schema public;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'guardianship_status' and n.nspname = 'public'
  ) then
    create type public.guardianship_status as enum ('active', 'revoked');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'conversation_kind' and n.nspname = 'public'
  ) then
    create type public.conversation_kind as enum ('direct', 'group');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'conversation_message_type' and n.nspname = 'public'
  ) then
    create type public.conversation_message_type as enum ('text', 'voice', 'arrival', 'system');
  end if;
end
$$;

create table if not exists public.guardianships (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  status public.guardianship_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guardianships_owner_guardian_key unique (owner_user_id, guardian_user_id),
  constraint guardianships_no_self check (owner_user_id <> guardian_user_id)
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  kind public.conversation_kind not null default 'direct',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_message_at timestamptz
);

create table if not exists public.conversation_participants (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  constraint conversation_participants_unique unique (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  message_type public.conversation_message_type not null default 'text',
  body text,
  voice_url text,
  duration_ms integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists guardianships_owner_status_idx
  on public.guardianships(owner_user_id, status, created_at desc);

create index if not exists guardianships_guardian_status_idx
  on public.guardianships(guardian_user_id, status, created_at desc);

create index if not exists conversations_last_message_idx
  on public.conversations(last_message_at desc nulls last, updated_at desc);

create index if not exists conversation_participants_user_idx
  on public.conversation_participants(user_id, joined_at desc);

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at asc);

create index if not exists app_notifications_user_created_idx
  on public.app_notifications(user_id, created_at desc);

create index if not exists app_notifications_user_read_idx
  on public.app_notifications(user_id, read_at);

create or replace function public.ensure_direct_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_conversation_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Utilisateur non authentifie';
  end if;
  if p_other_user_id is null then
    raise exception 'Utilisateur cible manquant';
  end if;
  if v_user_id = p_other_user_id then
    raise exception 'Impossible de creer une conversation avec soi-meme';
  end if;

  select c.id
  into v_conversation_id
  from public.conversations c
  where c.kind = 'direct'
    and exists (
      select 1
      from public.conversation_participants p
      where p.conversation_id = c.id
        and p.user_id = v_user_id
    )
    and exists (
      select 1
      from public.conversation_participants p
      where p.conversation_id = c.id
        and p.user_id = p_other_user_id
    )
    and (
      select count(*)
      from public.conversation_participants p
      where p.conversation_id = c.id
    ) = 2
  order by c.updated_at desc
  limit 1;

  if v_conversation_id is null then
    insert into public.conversations (kind, created_by, updated_at, last_message_at)
    values ('direct', v_user_id, now(), now())
    returning id into v_conversation_id;

    insert into public.conversation_participants (conversation_id, user_id, role)
    values
      (v_conversation_id, v_user_id, 'admin'),
      (v_conversation_id, p_other_user_id, 'member')
    on conflict do nothing;
  end if;

  return v_conversation_id;
end;
$$;

grant execute on function public.ensure_direct_conversation(uuid) to authenticated;

create or replace function public.handle_guardianships_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists guardianships_set_updated_at on public.guardianships;
create trigger guardianships_set_updated_at
before update on public.guardianships
for each row
execute function public.handle_guardianships_updated_at();

create or replace function public.handle_guardian_assigned_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' then
    insert into public.app_notifications (user_id, notification_type, title, body, data)
    values (
      new.guardian_user_id,
      'guardian_assigned',
      'Nouveau role de garant',
      'Un proche vous a assigne comme garant.',
      jsonb_build_object(
        'owner_user_id', new.owner_user_id,
        'guardianship_id', new.id
      )
    );
  end if;
  return new;
end;
$$;

drop trigger if exists guardianships_notify_insert on public.guardianships;
create trigger guardianships_notify_insert
after insert on public.guardianships
for each row
execute function public.handle_guardian_assigned_notification();

create or replace function public.handle_message_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_body text;
  participant_row record;
begin
  update public.conversations
  set
    updated_at = now(),
    last_message_at = coalesce(new.created_at, now())
  where id = new.conversation_id;

  if new.message_type = 'arrival' then
    v_title := 'Confirmation d arrivee';
    v_body := coalesce(nullif(trim(new.body), ''), 'Je suis bien rentre.');
  elsif new.message_type = 'voice' then
    v_title := 'Nouveau vocal';
    v_body := 'Un vocal vient d etre envoye.';
  else
    v_title := 'Nouveau message';
    v_body := coalesce(nullif(trim(new.body), ''), 'Vous avez recu un nouveau message.');
  end if;

  for participant_row in
    select cp.user_id
    from public.conversation_participants cp
    where cp.conversation_id = new.conversation_id
      and cp.user_id <> new.sender_user_id
  loop
    insert into public.app_notifications (user_id, notification_type, title, body, data)
    values (
      participant_row.user_id,
      case when new.message_type = 'arrival' then 'arrival_confirmed' else 'new_message' end,
      v_title,
      v_body,
      jsonb_build_object(
        'conversation_id', new.conversation_id,
        'message_id', new.id,
        'sender_user_id', new.sender_user_id,
        'message_type', new.message_type
      )
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists messages_notify_participants on public.messages;
create trigger messages_notify_participants
after insert on public.messages
for each row
execute function public.handle_message_notifications();

create or replace function public.can_access_conversation(
  p_conversation_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = p_conversation_id
      and cp.user_id = p_user_id
  );
$$;

grant execute on function public.can_access_conversation(uuid, uuid) to authenticated;

alter table public.guardianships enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages enable row level security;
alter table public.app_notifications enable row level security;

drop policy if exists guardianships_select on public.guardianships;
create policy guardianships_select
on public.guardianships
for select
using (auth.uid() = owner_user_id or auth.uid() = guardian_user_id);

drop policy if exists guardianships_insert on public.guardianships;
create policy guardianships_insert
on public.guardianships
for insert
with check (auth.uid() = owner_user_id and owner_user_id <> guardian_user_id);

drop policy if exists guardianships_update on public.guardianships;
create policy guardianships_update
on public.guardianships
for update
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

drop policy if exists guardianships_delete on public.guardianships;
create policy guardianships_delete
on public.guardianships
for delete
using (auth.uid() = owner_user_id);

drop policy if exists conversations_select on public.conversations;
create policy conversations_select
on public.conversations
for select
using (public.can_access_conversation(id, auth.uid()));

drop policy if exists conversation_participants_select on public.conversation_participants;
create policy conversation_participants_select
on public.conversation_participants
for select
using (public.can_access_conversation(conversation_id, auth.uid()));

drop policy if exists messages_select on public.messages;
create policy messages_select
on public.messages
for select
using (public.can_access_conversation(conversation_id, auth.uid()));

drop policy if exists messages_insert on public.messages;
create policy messages_insert
on public.messages
for insert
with check (
  sender_user_id = auth.uid()
  and public.can_access_conversation(conversation_id, auth.uid())
);

drop policy if exists app_notifications_select on public.app_notifications;
create policy app_notifications_select
on public.app_notifications
for select
using (auth.uid() = user_id);

drop policy if exists app_notifications_update on public.app_notifications;
create policy app_notifications_update
on public.app_notifications
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

commit;

-- ============================================================================
-- Migration 003: supabase/migrations/003_social_graph.sql
-- ============================================================================

-- Graphe social SafeBack (ID public + amis + demandes d'ami)
-- À exécuter après :
-- 1) supabase.align_app.sql
-- 2) supabase.messaging_notifications.sql

begin;

create extension if not exists pgcrypto with schema public;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'friend_request_status' and n.nspname = 'public'
  ) then
    create type public.friend_request_status as enum ('pending', 'accepted', 'rejected', 'cancelled');
  end if;
end
$$;

create or replace function public.generate_public_profile_id()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate text;
begin
  loop
    v_candidate := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    exit when not exists (
      select 1
      from public.profiles p
      where p.public_id = v_candidate
    );
  end loop;
  return v_candidate;
end;
$$;

alter table public.profiles add column if not exists public_id text;

update public.profiles
set public_id = public.generate_public_profile_id()
where coalesce(trim(public_id), '') = '';

create unique index if not exists profiles_public_id_unique_idx
  on public.profiles(public_id);

alter table public.profiles
  alter column public_id set default public.generate_public_profile_id();

create or replace function public.handle_profiles_public_id()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(trim(new.public_id), '') = '' then
    new.public_id := public.generate_public_profile_id();
  else
    new.public_id := upper(trim(new.public_id));
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_set_public_id on public.profiles;
create trigger profiles_set_public_id
before insert or update on public.profiles
for each row
execute function public.handle_profiles_public_id();

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  status public.friend_request_status not null default 'pending',
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_requests_unique_pair unique (requester_user_id, target_user_id),
  constraint friend_requests_no_self check (requester_user_id <> target_user_id)
);

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_user_id uuid not null references auth.users(id) on delete cascade,
  source_request_id uuid references public.friend_requests(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint friendships_unique_pair unique (user_id, friend_user_id),
  constraint friendships_no_self check (user_id <> friend_user_id)
);

create index if not exists friend_requests_target_status_idx
  on public.friend_requests(target_user_id, status, created_at desc);

create index if not exists friend_requests_requester_status_idx
  on public.friend_requests(requester_user_id, status, created_at desc);

create index if not exists friendships_user_created_idx
  on public.friendships(user_id, created_at desc);

create or replace function public.handle_friend_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists friend_requests_set_updated_at on public.friend_requests;
create trigger friend_requests_set_updated_at
before update on public.friend_requests
for each row
execute function public.handle_friend_requests_updated_at();

create or replace function public.ensure_profile_public_id()
returns table (
  user_id uuid,
  public_id text,
  username text,
  first_name text,
  last_name text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Utilisateur non authentifie';
  end if;

  insert into public.profiles (user_id, public_id)
  values (v_user_id, public.generate_public_profile_id())
  on conflict on constraint profiles_pkey do nothing;

  update public.profiles p
  set
    public_id = public.generate_public_profile_id(),
    updated_at = now()
  where p.user_id = v_user_id
    and coalesce(trim(p.public_id), '') = '';

  return query
  select p.user_id, p.public_id, p.username, p.first_name, p.last_name
  from public.profiles p
  where p.user_id = v_user_id;
end;
$$;

grant execute on function public.ensure_profile_public_id() to authenticated;

create or replace function public.search_public_profiles(
  p_query text,
  p_limit integer default 20
)
returns table (
  user_id uuid,
  public_id text,
  username text,
  first_name text,
  last_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_query text;
  v_limit integer;
begin
  v_query := trim(coalesce(p_query, ''));
  v_limit := greatest(1, least(coalesce(p_limit, 20), 50));

  if v_query = '' then
    return;
  end if;

  return query
  select p.user_id, p.public_id, p.username, p.first_name, p.last_name
  from public.profiles p
  where p.user_id <> auth.uid()
    and coalesce(trim(p.public_id), '') <> ''
    and (
      p.public_id ilike '%' || upper(v_query) || '%'
      or coalesce(p.username, '') ilike '%' || v_query || '%'
      or concat_ws(' ', coalesce(p.first_name, ''), coalesce(p.last_name, '')) ilike '%' || v_query || '%'
    )
  order by
    case
      when upper(p.public_id) = upper(v_query) then 0
      when lower(coalesce(p.username, '')) = lower(v_query) then 1
      else 2
    end,
    p.updated_at desc nulls last
  limit v_limit;
end;
$$;

grant execute on function public.search_public_profiles(text, integer) to authenticated;

create or replace function public.get_public_profiles(p_user_ids uuid[])
returns table (
  user_id uuid,
  public_id text,
  username text,
  first_name text,
  last_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id, p.public_id, p.username, p.first_name, p.last_name
  from public.profiles p
  where p.user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
    and coalesce(trim(p.public_id), '') <> '';
$$;

grant execute on function public.get_public_profiles(uuid[]) to authenticated;

create or replace function public.create_friendship_pair(
  p_user_a uuid,
  p_user_b uuid,
  p_source_request_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_a is null or p_user_b is null then
    raise exception 'Utilisateurs invalides pour l amitie';
  end if;
  if p_user_a = p_user_b then
    raise exception 'Impossible de creer une amitie avec soi-meme';
  end if;

  insert into public.friendships (user_id, friend_user_id, source_request_id)
  values (p_user_a, p_user_b, p_source_request_id)
  on conflict (user_id, friend_user_id) do nothing;

  insert into public.friendships (user_id, friend_user_id, source_request_id)
  values (p_user_b, p_user_a, p_source_request_id)
  on conflict (user_id, friend_user_id) do nothing;
end;
$$;

grant execute on function public.create_friendship_pair(uuid, uuid, uuid) to authenticated;

create or replace function public.send_friend_request(
  p_target_user_id uuid,
  p_message text default null
)
returns public.friend_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_reverse_request public.friend_requests%rowtype;
  v_request public.friend_requests%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Utilisateur non authentifie';
  end if;
  if p_target_user_id is null then
    raise exception 'Utilisateur cible manquant';
  end if;
  if v_user_id = p_target_user_id then
    raise exception 'Impossible de s ajouter soi-meme';
  end if;

  perform public.ensure_profile_public_id();

  if not exists (
    select 1
    from public.profiles p
    where p.user_id = p_target_user_id
  ) then
    raise exception 'Profil cible introuvable';
  end if;

  if exists (
    select 1
    from public.friendships f
    where f.user_id = v_user_id
      and f.friend_user_id = p_target_user_id
  ) then
    raise exception 'Vous etes deja amis';
  end if;

  select fr.*
  into v_reverse_request
  from public.friend_requests fr
  where fr.requester_user_id = p_target_user_id
    and fr.target_user_id = v_user_id
    and fr.status = 'pending'
  order by fr.created_at desc
  limit 1;

  if v_reverse_request.id is not null then
    update public.friend_requests fr
    set status = 'accepted', updated_at = now()
    where fr.id = v_reverse_request.id
    returning * into v_request;

    perform public.create_friendship_pair(v_request.requester_user_id, v_request.target_user_id, v_request.id);
    return v_request;
  end if;

  insert into public.friend_requests (requester_user_id, target_user_id, status, message)
  values (v_user_id, p_target_user_id, 'pending', nullif(trim(p_message), ''))
  on conflict (requester_user_id, target_user_id)
  do update
    set status = 'pending',
        message = excluded.message,
        updated_at = now()
  returning * into v_request;

  return v_request;
end;
$$;

grant execute on function public.send_friend_request(uuid, text) to authenticated;

create or replace function public.respond_friend_request(
  p_request_id uuid,
  p_accept boolean
)
returns public.friend_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_request public.friend_requests%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Utilisateur non authentifie';
  end if;
  if p_request_id is null then
    raise exception 'Demande introuvable';
  end if;

  select fr.*
  into v_request
  from public.friend_requests fr
  where fr.id = p_request_id
    and fr.target_user_id = v_user_id
  for update;

  if not found then
    raise exception 'Demande non accessible';
  end if;

  if v_request.status <> 'pending' then
    return v_request;
  end if;

  update public.friend_requests fr
  set
    status = case when p_accept then 'accepted' else 'rejected' end,
    updated_at = now()
  where fr.id = v_request.id
  returning * into v_request;

  if p_accept then
    perform public.create_friendship_pair(v_request.requester_user_id, v_request.target_user_id, v_request.id);
    begin
      perform public.ensure_direct_conversation(v_request.requester_user_id);
    exception
      when others then
        null;
    end;
  end if;

  return v_request;
end;
$$;

grant execute on function public.respond_friend_request(uuid, boolean) to authenticated;

create or replace function public.handle_friend_request_created_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_label text;
begin
  if new.status <> 'pending' then
    return new;
  end if;

  select coalesce(
    nullif(trim(p.username), ''),
    nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    p.public_id,
    left(new.requester_user_id::text, 8)
  )
  into v_requester_label
  from public.profiles p
  where p.user_id = new.requester_user_id;

  insert into public.app_notifications (user_id, notification_type, title, body, data)
  values (
    new.target_user_id,
    'friend_request_received',
    'Nouvelle demande d ami',
    coalesce(v_requester_label, 'Un utilisateur') || ' veut vous ajouter en ami.',
    jsonb_build_object(
      'friend_request_id', new.id,
      'requester_user_id', new.requester_user_id
    )
  );

  return new;
end;
$$;

drop trigger if exists friend_requests_notify_insert on public.friend_requests;
create trigger friend_requests_notify_insert
after insert on public.friend_requests
for each row
execute function public.handle_friend_request_created_notification();

create or replace function public.handle_friend_request_status_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target_label text;
begin
  if old.status = new.status then
    return new;
  end if;

  if new.status = 'accepted' then
    select coalesce(
      nullif(trim(p.username), ''),
      nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
      p.public_id,
      left(new.target_user_id::text, 8)
    )
    into v_target_label
    from public.profiles p
    where p.user_id = new.target_user_id;

    insert into public.app_notifications (user_id, notification_type, title, body, data)
    values (
      new.requester_user_id,
      'friend_request_accepted',
      'Demande acceptee',
      coalesce(v_target_label, 'Un utilisateur') || ' a accepte votre demande d ami.',
      jsonb_build_object(
        'friend_request_id', new.id,
        'target_user_id', new.target_user_id
      )
    );
  elsif new.status = 'rejected' then
    insert into public.app_notifications (user_id, notification_type, title, body, data)
    values (
      new.requester_user_id,
      'friend_request_rejected',
      'Demande refusee',
      'Votre demande d ami a ete refusee.',
      jsonb_build_object(
        'friend_request_id', new.id,
        'target_user_id', new.target_user_id
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists friend_requests_notify_update on public.friend_requests;
create trigger friend_requests_notify_update
after update on public.friend_requests
for each row
execute function public.handle_friend_request_status_notifications();

alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;

drop policy if exists friend_requests_select on public.friend_requests;
create policy friend_requests_select
on public.friend_requests
for select
using (auth.uid() = requester_user_id or auth.uid() = target_user_id);

drop policy if exists friend_requests_insert on public.friend_requests;
create policy friend_requests_insert
on public.friend_requests
for insert
with check (auth.uid() = requester_user_id and requester_user_id <> target_user_id);

drop policy if exists friend_requests_update on public.friend_requests;
create policy friend_requests_update
on public.friend_requests
for update
using (auth.uid() = requester_user_id or auth.uid() = target_user_id)
with check (auth.uid() = requester_user_id or auth.uid() = target_user_id);

drop policy if exists friend_requests_delete on public.friend_requests;
create policy friend_requests_delete
on public.friend_requests
for delete
using (auth.uid() = requester_user_id);

drop policy if exists friendships_select on public.friendships;
create policy friendships_select
on public.friendships
for select
using (auth.uid() = user_id);

drop policy if exists friendships_delete on public.friendships;
create policy friendships_delete
on public.friendships
for delete
using (auth.uid() = user_id);

commit;

-- ============================================================================
-- Migration 004: supabase/migrations/004_fix_42702_user_id_ambiguous.sql
-- ============================================================================

-- Correctif pour :
-- 42702 : la référence de colonne "user_id" est ambiguë
-- lors de l'appel à public.ensure_profile_public_id()

create or replace function public.ensure_profile_public_id()
returns table (
  user_id uuid,
  public_id text,
  username text,
  first_name text,
  last_name text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Utilisateur non authentifie';
  end if;

  insert into public.profiles (user_id, public_id)
  values (v_user_id, public.generate_public_profile_id())
  on conflict on constraint profiles_pkey do nothing;

  update public.profiles p
  set
    public_id = public.generate_public_profile_id(),
    updated_at = now()
  where p.user_id = v_user_id
    and coalesce(trim(p.public_id), '') = '';

  return query
  select p.user_id, p.public_id, p.username, p.first_name, p.last_name
  from public.profiles p
  where p.user_id = v_user_id;
end;
$$;

grant execute on function public.ensure_profile_public_id() to authenticated;

-- ============================================================================
-- Migration 005: supabase/migrations/005_guardian_check_requests.sql
-- ============================================================================

-- SafeBack : demande de nouvelles par un garant
-- Ajoute une option profil pour autoriser/refuser cette fonctionnalité
-- et expose un RPC sécurisé pour envoyer la demande.

begin;

alter table public.profiles
  add column if not exists allow_guardian_check_requests boolean not null default false;

create or replace function public.request_guardian_wellbeing_check(p_owner_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_guardian_user_id uuid;
  v_has_active_guardianship boolean;
  v_enabled boolean;
  v_has_recent_trip boolean;
begin
  v_guardian_user_id := auth.uid();
  if v_guardian_user_id is null then
    raise exception 'Utilisateur non authentifie';
  end if;

  if p_owner_user_id is null then
    raise exception 'Proche cible manquant';
  end if;

  if p_owner_user_id = v_guardian_user_id then
    raise exception 'Impossible de se demander des nouvelles a soi-meme';
  end if;

  select exists (
    select 1
    from public.guardianships g
    where g.owner_user_id = p_owner_user_id
      and g.guardian_user_id = v_guardian_user_id
      and g.status = 'active'
  )
  into v_has_active_guardianship;

  if not v_has_active_guardianship then
    return jsonb_build_object(
      'sent', false,
      'status', 'not_guardian'
    );
  end if;

  select coalesce(p.allow_guardian_check_requests, false)
  into v_enabled
  from public.profiles p
  where p.user_id = p_owner_user_id;

  if not coalesce(v_enabled, false) then
    return jsonb_build_object(
      'sent', false,
      'status', 'disabled'
    );
  end if;

  select exists (
    select 1
    from public.sessions s
    where s.user_id = p_owner_user_id
      and s.created_at >= now() - interval '24 hours'
  )
  into v_has_recent_trip;

  insert into public.app_notifications (user_id, notification_type, title, body, data)
  values (
    p_owner_user_id,
    'guardian_check_request',
    'Un proche demande de tes nouvelles',
    'Ton garant souhaite verifier que tu es bien rentre. Tu peux lui envoyer une confirmation.',
    jsonb_build_object(
      'guardian_user_id', v_guardian_user_id,
      'owner_user_id', p_owner_user_id,
      'has_recent_trip_24h', v_has_recent_trip
    )
  );

  insert into public.app_notifications (user_id, notification_type, title, body, data)
  values (
    v_guardian_user_id,
    'guardian_check_request_sent',
    'Demande envoyee',
    case
      when v_has_recent_trip
        then 'Demande envoyee. Un trajet recent existe, ton proche va pouvoir confirmer son arrivee.'
      else 'Demande envoyee. Aucun trajet recent detecte.'
    end,
    jsonb_build_object(
      'guardian_user_id', v_guardian_user_id,
      'owner_user_id', p_owner_user_id,
      'has_recent_trip_24h', v_has_recent_trip
    )
  );

  return jsonb_build_object(
    'sent', true,
    'status', 'sent',
    'has_recent_trip_24h', v_has_recent_trip
  );
end;
$$;

grant execute on function public.request_guardian_wellbeing_check(uuid) to authenticated;

commit;

-- ============================================================================
-- Migration 006: supabase/migrations/006_incident_reports.sql
-- ============================================================================

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

-- ============================================================================
-- Migration 007: supabase/migrations/007_friend_map_and_wellbeing_ping.sql
-- ============================================================================

-- SafeBack: carte amis (position + etat reseau) et ping rapide "bien arrive".
-- A executer apres 001..006.

begin;

-- Preferences profil pour la carte sociale.
alter table public.profiles
  add column if not exists map_share_enabled boolean not null default false;

alter table public.profiles
  add column if not exists map_avatar text not null default '🧭';

-- Presence carte en direct (derniere position + connectivite reseau).
create table if not exists public.friend_map_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  marker_emoji text not null default '🧭',
  network_connected boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists friend_map_presence_updated_idx
  on public.friend_map_presence(updated_at desc);

-- Ping de reassurance: "Es-tu bien arrive ?" en 1 clic.
create table if not exists public.friend_wellbeing_pings (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'arrived_yes', 'arrived_no', 'cancelled')),
  response_note text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_wellbeing_pings_no_self check (requester_user_id <> target_user_id)
);

create index if not exists friend_wellbeing_pings_requester_idx
  on public.friend_wellbeing_pings(requester_user_id, created_at desc);

create index if not exists friend_wellbeing_pings_target_idx
  on public.friend_wellbeing_pings(target_user_id, created_at desc);

create or replace function public.handle_friend_wellbeing_pings_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists friend_wellbeing_pings_set_updated_at on public.friend_wellbeing_pings;
create trigger friend_wellbeing_pings_set_updated_at
before update on public.friend_wellbeing_pings
for each row
execute function public.handle_friend_wellbeing_pings_updated_at();

create or replace function public.send_friend_wellbeing_ping(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requester_user_id uuid;
  v_ping_id uuid;
  v_requester_label text;
begin
  v_requester_user_id := auth.uid();
  if v_requester_user_id is null then
    raise exception 'Utilisateur non authentifie';
  end if;

  if p_target_user_id is null then
    raise exception 'Cible manquante';
  end if;

  if v_requester_user_id = p_target_user_id then
    raise exception 'Impossible de vous auto-interroger';
  end if;

  -- Autorise uniquement entre amis.
  if not exists (
    select 1
    from public.friendships f
    where f.user_id = v_requester_user_id
      and f.friend_user_id = p_target_user_id
  ) then
    raise exception 'Action reservee aux amis';
  end if;

  -- Evite les doublons en chaine: une demande pending max par paire.
  if exists (
    select 1
    from public.friend_wellbeing_pings p
    where p.requester_user_id = v_requester_user_id
      and p.target_user_id = p_target_user_id
      and p.status = 'pending'
  ) then
    return jsonb_build_object(
      'sent', false,
      'status', 'already_pending'
    );
  end if;

  insert into public.friend_wellbeing_pings (requester_user_id, target_user_id, status)
  values (v_requester_user_id, p_target_user_id, 'pending')
  returning id into v_ping_id;

  select coalesce(
    nullif(trim(p.username), ''),
    nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''),
    p.public_id,
    left(v_requester_user_id::text, 8)
  )
  into v_requester_label
  from public.profiles p
  where p.user_id = v_requester_user_id;

  insert into public.app_notifications (user_id, notification_type, title, body, data)
  values (
    p_target_user_id,
    'friend_wellbeing_ping',
    'Verification rapide',
    coalesce(v_requester_label, 'Un proche') || ' te demande si tu es bien arrive.',
    jsonb_build_object(
      'ping_id', v_ping_id,
      'requester_user_id', v_requester_user_id,
      'target_user_id', p_target_user_id
    )
  );

  insert into public.app_notifications (user_id, notification_type, title, body, data)
  values (
    v_requester_user_id,
    'friend_wellbeing_ping_sent',
    'Demande envoyee',
    'Ta demande de verification a ete envoyee.',
    jsonb_build_object(
      'ping_id', v_ping_id,
      'requester_user_id', v_requester_user_id,
      'target_user_id', p_target_user_id
    )
  );

  return jsonb_build_object(
    'sent', true,
    'status', 'sent',
    'ping_id', v_ping_id
  );
end;
$$;

grant execute on function public.send_friend_wellbeing_ping(uuid) to authenticated;

create or replace function public.respond_friend_wellbeing_ping(
  p_ping_id uuid,
  p_arrived boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_ping public.friend_wellbeing_pings%rowtype;
  v_target_label text;
  v_status text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Utilisateur non authentifie';
  end if;

  if p_ping_id is null then
    raise exception 'Demande introuvable';
  end if;

  select p.*
  into v_ping
  from public.friend_wellbeing_pings p
  where p.id = p_ping_id
    and p.target_user_id = v_user_id
  for update;

  if not found then
    raise exception 'Demande non accessible';
  end if;

  if v_ping.status <> 'pending' then
    return jsonb_build_object(
      'updated', false,
      'status', v_ping.status
    );
  end if;

  v_status := case when coalesce(p_arrived, false) then 'arrived_yes' else 'arrived_no' end;

  update public.friend_wellbeing_pings p
  set
    status = v_status,
    responded_at = now(),
    updated_at = now()
  where p.id = v_ping.id;

  select coalesce(
    nullif(trim(pr.username), ''),
    nullif(trim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
    pr.public_id,
    left(v_user_id::text, 8)
  )
  into v_target_label
  from public.profiles pr
  where pr.user_id = v_user_id;

  insert into public.app_notifications (user_id, notification_type, title, body, data)
  values (
    v_ping.requester_user_id,
    'friend_wellbeing_response',
    'Reponse recue',
    case
      when v_status = 'arrived_yes'
        then coalesce(v_target_label, 'Ton proche') || ' confirme etre bien arrive.'
      else coalesce(v_target_label, 'Ton proche') || ' indique ne pas etre encore arrive.'
    end,
    jsonb_build_object(
      'ping_id', v_ping.id,
      'status', v_status,
      'requester_user_id', v_ping.requester_user_id,
      'target_user_id', v_ping.target_user_id
    )
  );

  return jsonb_build_object(
    'updated', true,
    'status', v_status
  );
end;
$$;

grant execute on function public.respond_friend_wellbeing_ping(uuid, boolean) to authenticated;

alter table public.friend_map_presence enable row level security;
alter table public.friend_wellbeing_pings enable row level security;

-- Presence map: lecture par soi-meme ou amis si partage actif.
drop policy if exists friend_map_presence_select on public.friend_map_presence;
create policy friend_map_presence_select
on public.friend_map_presence
for select
using (
  auth.uid() = user_id
  or (
    exists (
      select 1
      from public.profiles p
      where p.user_id = friend_map_presence.user_id
        and coalesce(p.map_share_enabled, false) = true
    )
    and exists (
      select 1
      from public.friendships f
      where f.user_id = auth.uid()
        and f.friend_user_id = friend_map_presence.user_id
    )
  )
);

drop policy if exists friend_map_presence_insert on public.friend_map_presence;
create policy friend_map_presence_insert
on public.friend_map_presence
for insert
with check (auth.uid() = user_id);

drop policy if exists friend_map_presence_update on public.friend_map_presence;
create policy friend_map_presence_update
on public.friend_map_presence
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists friend_map_presence_delete on public.friend_map_presence;
create policy friend_map_presence_delete
on public.friend_map_presence
for delete
using (auth.uid() = user_id);

-- Pings: uniquement participants.
drop policy if exists friend_wellbeing_pings_select on public.friend_wellbeing_pings;
create policy friend_wellbeing_pings_select
on public.friend_wellbeing_pings
for select
using (auth.uid() = requester_user_id or auth.uid() = target_user_id);

drop policy if exists friend_wellbeing_pings_insert on public.friend_wellbeing_pings;
create policy friend_wellbeing_pings_insert
on public.friend_wellbeing_pings
for insert
with check (auth.uid() = requester_user_id and requester_user_id <> target_user_id);

drop policy if exists friend_wellbeing_pings_update on public.friend_wellbeing_pings;
create policy friend_wellbeing_pings_update
on public.friend_wellbeing_pings
for update
using (auth.uid() = requester_user_id or auth.uid() = target_user_id)
with check (auth.uid() = requester_user_id or auth.uid() = target_user_id);

commit;
