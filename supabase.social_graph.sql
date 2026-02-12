-- SafeBack social graph (public ID + friends + friend requests)
-- Run after:
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
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Utilisateur non authentifie';
  end if;

  insert into public.profiles (user_id, public_id)
  values (v_user_id, public.generate_public_profile_id())
  on conflict (user_id) do nothing;

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
