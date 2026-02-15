-- SafeBack: suppression complète du compte courant (self-service)

begin;

create or replace function public.delete_my_account()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Utilisateur non authentifie';
  end if;

  delete from public.friend_wellbeing_pings
  where requester_user_id = v_user_id
     or target_user_id = v_user_id;

  delete from public.friend_map_presence
  where user_id = v_user_id;

  delete from public.guardianships
  where owner_user_id = v_user_id
     or guardian_user_id = v_user_id;

  delete from public.friendships
  where user_id = v_user_id
     or friend_user_id = v_user_id;

  delete from public.friend_requests
  where requester_user_id = v_user_id
     or target_user_id = v_user_id;

  delete from public.messages
  where sender_user_id = v_user_id;

  delete from public.conversation_participants
  where user_id = v_user_id;

  delete from public.incident_reports
  where user_id = v_user_id;

  delete from public.app_notifications
  where user_id = v_user_id;

  delete from public.locations
  where session_id in (
    select s.id from public.sessions s where s.user_id = v_user_id
  );

  delete from public.session_contacts
  where session_id in (
    select s.id from public.sessions s where s.user_id = v_user_id
  );

  delete from public.sessions
  where user_id = v_user_id;

  delete from public.contacts
  where user_id = v_user_id;

  delete from public.favorite_addresses
  where user_id = v_user_id;

  delete from public.profiles
  where user_id = v_user_id;

  delete from auth.identities where user_id = v_user_id;
  delete from auth.sessions where user_id = v_user_id;
  delete from auth.users where id = v_user_id;

  return jsonb_build_object('deleted', true);
end;
$$;

grant execute on function public.delete_my_account() to authenticated;

commit;

