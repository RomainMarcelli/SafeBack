-- Correctif ciblé:
-- column "status" is of type friend_request_status but expression is of type text
-- Recrée les RPC avec cast explicite vers l'enum public.friend_request_status.

begin;

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
    raise exception 'Profil cible introuvable';
  end if;
  if p_target_user_id = v_user_id then
    raise exception 'Impossible de s envoyer une demande';
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
    set status = 'accepted'::public.friend_request_status, updated_at = now()
    where fr.id = v_reverse_request.id
    returning * into v_request;

    perform public.create_friendship_pair(v_request.requester_user_id, v_request.target_user_id, v_request.id);
    return v_request;
  end if;

  insert into public.friend_requests (requester_user_id, target_user_id, status, message)
  values (
    v_user_id,
    p_target_user_id,
    'pending'::public.friend_request_status,
    nullif(trim(p_message), '')
  )
  on conflict (requester_user_id, target_user_id)
  do update
    set status = 'pending'::public.friend_request_status,
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
    status = case
      when p_accept
        then 'accepted'::public.friend_request_status
      else 'rejected'::public.friend_request_status
    end,
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

commit;

