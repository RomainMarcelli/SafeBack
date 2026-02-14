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
