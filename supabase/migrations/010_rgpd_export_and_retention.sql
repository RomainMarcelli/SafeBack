-- SafeBack: RGPD (export + suppression renforcée) + rétention automatique

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

  -- Données sociales/sécurité
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

  -- Messagerie/notifications
  delete from public.messages
  where sender_user_id = v_user_id;

  delete from public.conversation_participants
  where user_id = v_user_id;

  -- Nettoie les conversations devenues vides après suppression des participants.
  delete from public.conversations c
  where not exists (
    select 1
    from public.conversation_participants cp
    where cp.conversation_id = c.id
  );

  delete from public.app_notifications
  where user_id = v_user_id;

  -- Données incidents/monitoring
  delete from public.incident_reports
  where user_id = v_user_id;

  delete from public.runtime_error_events
  where user_id = v_user_id;

  delete from public.ux_metric_events
  where user_id = v_user_id;

  delete from public.user_device_sessions
  where user_id = v_user_id;

  -- Données trajets
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

  -- Données compte
  delete from public.contacts
  where user_id = v_user_id;

  delete from public.favorite_addresses
  where user_id = v_user_id;

  delete from public.profiles
  where user_id = v_user_id;

  -- Auth Supabase
  delete from auth.identities where user_id = v_user_id;
  delete from auth.sessions where user_id = v_user_id;
  delete from auth.users where id = v_user_id;

  return jsonb_build_object(
    'deleted', true,
    'user_id', v_user_id
  );
end;
$$;

grant execute on function public.delete_my_account() to authenticated;

create or replace function public.export_my_data()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid;
  v_session_ids uuid[];
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Utilisateur non authentifie';
  end if;

  select coalesce(array_agg(s.id), '{}'::uuid[])
  into v_session_ids
  from public.sessions s
  where s.user_id = v_user_id;

  return jsonb_build_object(
    'generated_at', now(),
    'user_id', v_user_id,
    'profile', (
      select to_jsonb(p)
      from public.profiles p
      where p.user_id = v_user_id
    ),
    'favorite_addresses', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.created_at desc)
      from public.favorite_addresses f
      where f.user_id = v_user_id
    ), '[]'::jsonb),
    'contacts', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at desc)
      from public.contacts c
      where c.user_id = v_user_id
    ), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at desc)
      from public.sessions s
      where s.user_id = v_user_id
    ), '[]'::jsonb),
    'session_contacts', coalesce((
      select jsonb_agg(to_jsonb(sc) order by sc.created_at desc)
      from public.session_contacts sc
      where sc.session_id = any(v_session_ids)
    ), '[]'::jsonb),
    'locations', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.recorded_at desc)
      from public.locations l
      where l.session_id = any(v_session_ids)
    ), '[]'::jsonb),
    'incidents', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.occurred_at desc)
      from public.incident_reports i
      where i.user_id = v_user_id
    ), '[]'::jsonb),
    'conversations', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.updated_at desc)
      from public.conversations c
      where exists (
        select 1
        from public.conversation_participants cp
        where cp.conversation_id = c.id
          and cp.user_id = v_user_id
      )
    ), '[]'::jsonb),
    'conversation_participants', coalesce((
      select jsonb_agg(to_jsonb(cp) order by cp.joined_at desc)
      from public.conversation_participants cp
      where cp.conversation_id in (
        select cp2.conversation_id
        from public.conversation_participants cp2
        where cp2.user_id = v_user_id
      )
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at desc)
      from public.messages m
      where m.conversation_id in (
        select cp.conversation_id
        from public.conversation_participants cp
        where cp.user_id = v_user_id
      )
    ), '[]'::jsonb),
    'app_notifications', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at desc)
      from public.app_notifications n
      where n.user_id = v_user_id
    ), '[]'::jsonb),
    'runtime_error_events', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.created_at desc)
      from public.runtime_error_events e
      where e.user_id = v_user_id
    ), '[]'::jsonb),
    'ux_metric_events', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.created_at desc)
      from public.ux_metric_events m
      where m.user_id = v_user_id
    ), '[]'::jsonb),
    'user_device_sessions', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.last_seen_at desc)
      from public.user_device_sessions s
      where s.user_id = v_user_id
    ), '[]'::jsonb),
    'guardianships', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.created_at desc)
      from public.guardianships g
      where g.owner_user_id = v_user_id
         or g.guardian_user_id = v_user_id
    ), '[]'::jsonb),
    'friend_requests', coalesce((
      select jsonb_agg(to_jsonb(fr) order by fr.created_at desc)
      from public.friend_requests fr
      where fr.requester_user_id = v_user_id
         or fr.target_user_id = v_user_id
    ), '[]'::jsonb),
    'friendships', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.created_at desc)
      from public.friendships f
      where f.user_id = v_user_id
         or f.friend_user_id = v_user_id
    ), '[]'::jsonb),
    'friend_map_presence', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.updated_at desc)
      from public.friend_map_presence p
      where p.user_id = v_user_id
    ), '[]'::jsonb),
    'friend_wellbeing_pings', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.created_at desc)
      from public.friend_wellbeing_pings p
      where p.requester_user_id = v_user_id
         or p.target_user_id = v_user_id
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.export_my_data() to authenticated;

-- Purge des erreurs runtime anciennes.
create or replace function public.purge_runtime_error_events_retention(
  p_older_than interval default interval '90 days'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer := 0;
begin
  delete from public.runtime_error_events
  where created_at < now() - p_older_than;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

-- Purge des points GPS anciens.
create or replace function public.purge_locations_retention(
  p_older_than interval default interval '90 days'
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer := 0;
begin
  delete from public.locations
  where recorded_at < now() - p_older_than;

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

grant execute on function public.purge_runtime_error_events_retention(interval) to service_role;
grant execute on function public.purge_locations_retention(interval) to service_role;

-- Planification automatique via pg_cron si disponible.
do $$
declare
  v_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for v_job_id in
      execute $sql$
        select j.jobid
        from cron.job j
        where j.jobname in (
          'safeback_purge_runtime_error_events_90d',
          'safeback_purge_locations_90d'
        )
      $sql$
    loop
      execute format('select cron.unschedule(%s)', v_job_id);
    end loop;

    -- Tous les jours à 03:20 UTC.
    execute $sql$
      select cron.schedule(
        'safeback_purge_runtime_error_events_90d',
        '20 3 * * *',
        'select public.purge_runtime_error_events_retention(interval ''90 days'');'
      )
    $sql$;

    -- Tous les jours à 03:30 UTC.
    execute $sql$
      select cron.schedule(
        'safeback_purge_locations_90d',
        '30 3 * * *',
        'select public.purge_locations_retention(interval ''90 days'');'
      )
    $sql$;
  else
    raise notice 'pg_cron non installe: planification automatique ignorée.';
  end if;
exception
  when undefined_table or undefined_function then
    raise notice 'pg_cron indisponible dans cet environnement: planification ignorée.';
end;
$$;

commit;
