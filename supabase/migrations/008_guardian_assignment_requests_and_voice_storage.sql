-- SafeBack
-- 1) Demande de garant entre amis (notification)
-- 2) Bucket storage pour vocaux de messagerie

begin;

create or replace function public.request_guardian_assignment(
  p_target_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_already_guardian boolean;
  v_are_friends boolean;
  v_already_requested boolean;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Utilisateur non authentifie';
  end if;

  if p_target_user_id is null then
    raise exception 'Proche cible manquant';
  end if;

  if p_target_user_id = v_user_id then
    raise exception 'Impossible de demander soi-meme';
  end if;

  select exists (
    select 1
    from public.guardianships g
    where g.owner_user_id = v_user_id
      and g.guardian_user_id = p_target_user_id
      and g.status = 'active'
  )
  into v_already_guardian;

  if v_already_guardian then
    return jsonb_build_object('sent', false, 'status', 'already_guardian');
  end if;

  select exists (
    select 1
    from public.friendships f
    where f.user_id = v_user_id
      and f.friend_user_id = p_target_user_id
  )
  into v_are_friends;

  if not v_are_friends then
    return jsonb_build_object('sent', false, 'status', 'not_friend');
  end if;

  select exists (
    select 1
    from public.app_notifications n
    where n.user_id = p_target_user_id
      and n.notification_type = 'guardian_assignment_request'
      and (n.data ->> 'owner_user_id')::uuid = v_user_id
      and n.created_at >= now() - interval '12 hours'
  )
  into v_already_requested;

  if v_already_requested then
    return jsonb_build_object('sent', false, 'status', 'already_requested');
  end if;

  insert into public.app_notifications (user_id, notification_type, title, body, data)
  values (
    p_target_user_id,
    'guardian_assignment_request',
    'Demande de garant',
    'Un proche souhaite que tu deviennes son garant sur SafeBack.',
    jsonb_build_object(
      'owner_user_id', v_user_id,
      'target_user_id', p_target_user_id
    )
  );

  insert into public.app_notifications (user_id, notification_type, title, body, data)
  values (
    v_user_id,
    'guardian_assignment_request_sent',
    'Demande envoyee',
    'Ta demande de garant a ete envoyee.',
    jsonb_build_object(
      'owner_user_id', v_user_id,
      'target_user_id', p_target_user_id
    )
  );

  return jsonb_build_object('sent', true, 'status', 'sent');
end;
$$;

grant execute on function public.request_guardian_assignment(uuid) to authenticated;

-- Bucket vocaux: public pour lecture directe des notes vocales.
insert into storage.buckets (id, name, public)
values ('voice-notes', 'voice-notes', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists voice_notes_insert on storage.objects;
create policy voice_notes_insert
on storage.objects
for insert
to authenticated
with check (bucket_id = 'voice-notes' and owner = auth.uid());

drop policy if exists voice_notes_update on storage.objects;
create policy voice_notes_update
on storage.objects
for update
to authenticated
using (bucket_id = 'voice-notes' and owner = auth.uid())
with check (bucket_id = 'voice-notes' and owner = auth.uid());

drop policy if exists voice_notes_delete on storage.objects;
create policy voice_notes_delete
on storage.objects
for delete
to authenticated
using (bucket_id = 'voice-notes' and owner = auth.uid());

commit;

