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
