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
