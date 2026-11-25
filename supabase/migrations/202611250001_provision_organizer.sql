begin;

create function public.provision_organizer(p_user_id uuid, p_organization_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_profile public.user_profiles%rowtype;
  new_organization_id uuid;
begin
  if p_organization_name is null or length(btrim(p_organization_name)) not between 2 and 120 then
    raise exception 'Invalid organization name' using errcode = '22023';
  end if;

  -- Serialize provisioning for this account across callback and onboarding retries.
  perform 1
  from auth.users
  where id = p_user_id and email_confirmed_at is not null
  for update;

  if not found then
    raise exception 'A confirmed account is required' using errcode = '42501';
  end if;

  select * into existing_profile
  from public.user_profiles
  where user_id = p_user_id;

  if found then
    if existing_profile.role = 'organizer' and existing_profile.organization_id is not null then
      return;
    end if;

    raise exception 'This account already has a different role' using errcode = '42501';
  end if;

  insert into public.organizations (name)
  values (btrim(p_organization_name))
  returning id into new_organization_id;

  insert into public.user_profiles (user_id, organization_id, role)
  values (p_user_id, new_organization_id, 'organizer');
end;
$$;

revoke all on function public.provision_organizer(uuid, text) from public, anon, authenticated;
grant execute on function public.provision_organizer(uuid, text) to service_role;

commit;
