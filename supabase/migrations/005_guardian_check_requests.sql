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
