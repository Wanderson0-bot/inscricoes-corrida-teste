-- Remove CPF fields from databases that already applied the previous manual-registration migration.
drop trigger if exists registrations_prevent_duplicate_active on public.registrations;
drop function if exists public.prevent_duplicate_active_registration();
drop index if exists public.registrations_active_race_cpf_uidx;
drop function if exists public.create_public_registration_with_cpf(uuid, uuid, uuid, text, text, text, text, text, text);
drop function if exists public.is_valid_cpf(text);
drop function if exists public.create_manual_registration(uuid, uuid, uuid, text, text, text, text, text, date, text, uuid, text);
alter table public.registrations drop column if exists participant_cpf;

create or replace function public.prevent_duplicate_active_registration()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('pending', 'paid', 'courtesy') then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      new.race_id::text || '|' || lower(trim(new.participant_name)) || '|' || lower(trim(new.participant_email)), 0
    ));
    if exists (
      select 1 from public.registrations r
      where r.race_id = new.race_id
        and lower(trim(r.participant_name)) = lower(trim(new.participant_name))
        and lower(trim(r.participant_email)) = lower(trim(new.participant_email))
        and r.status in ('pending', 'paid', 'courtesy')
    ) then
      raise exception 'duplicate_registration' using errcode = '23505';
    end if;
  end if;
  return new;
end;
$$;

create trigger registrations_prevent_duplicate_active
before insert on public.registrations
for each row execute function public.prevent_duplicate_active_registration();

create or replace function public.create_manual_registration(
  p_race_id uuid,
  p_category_id uuid,
  p_team_id uuid,
  p_coupon_code text,
  p_participant_name text,
  p_participant_email text,
  p_participant_phone text,
  p_birth_date date,
  p_sex text,
  p_created_by_user_id uuid,
  p_privacy_policy_version text
)
returns table (registration_id uuid, amount_cents integer, organizer_recipient_id text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_race public.races%rowtype;
  v_category public.race_categories%rowtype;
  v_coupon public.race_coupons%rowtype;
  v_amount integer;
  v_usage_count bigint;
  v_coupon_id uuid;
  v_registration_id uuid;
  v_recipient_id text;
begin
  if length(trim(coalesce(p_participant_name, ''))) not between 2 and 160
     or length(trim(coalesce(p_participant_email, ''))) not between 3 and 254
     or p_birth_date is null or p_birth_date > current_date
     or (p_sex is not null and p_sex not in ('female', 'male', 'other', 'prefer_not_to_say')) then
    raise exception 'invalid_registration_data' using errcode = '22023';
  end if;

  select r.* into v_race from public.races r
  where r.id = p_race_id
    and (r.organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()))
  for share;
  if not found then raise exception 'race_not_found' using errcode = 'P0002'; end if;
  select o.pagarme_recipient_id into v_recipient_id from public.organizations o where o.id = v_race.organization_id;

  update public.registrations r set status = 'expired'
  where r.race_id = p_race_id and r.status = 'pending' and r.expires_at <= now();

  select c.* into v_category from public.race_categories c
  where c.id = p_category_id and c.race_id = p_race_id for update;
  if not found then raise exception 'category_not_found' using errcode = 'P0002'; end if;
  if (select count(*) from public.registrations r where r.category_id = p_category_id
      and r.status in ('pending','paid','courtesy')
      and (r.status <> 'pending' or r.expires_at > now())) >= v_category.capacity then
    raise exception 'category_full' using errcode = 'P0001';
  end if;

  v_amount := v_category.price_cents;
  if nullif(trim(coalesce(p_coupon_code, '')), '') is not null then
    select c.* into v_coupon from public.race_coupons c
    where c.race_id = p_race_id and c.code = upper(trim(p_coupon_code)) and c.enabled for update;
    if not found then raise exception 'coupon_invalid' using errcode = 'P0001'; end if;
    if exists (select 1 from public.race_coupon_teams ct where ct.coupon_id = v_coupon.id)
      and (p_team_id is null or not exists (select 1 from public.race_coupon_teams ct where ct.coupon_id = v_coupon.id and ct.team_id = p_team_id)) then
      raise exception 'coupon_not_allowed_for_team' using errcode = 'P0001';
    end if;
    if p_team_id is not null and not exists (select 1 from public.race_teams t where t.id = p_team_id and t.race_id = p_race_id) then
      raise exception 'team_not_found' using errcode = 'P0002';
    end if;
    select count(*) into v_usage_count from public.registrations r where r.coupon_id = v_coupon.id
      and r.status in ('pending','paid','courtesy') and (r.status <> 'pending' or r.expires_at > now());
    if v_coupon.usage_limit is not null and v_usage_count >= v_coupon.usage_limit then
      raise exception 'coupon_limit_reached' using errcode = 'P0001';
    end if;
    if v_coupon.discount_type = 'percentage' then
      v_amount := greatest(0, v_amount - floor(v_amount::numeric * v_coupon.discount_value / 100)::integer);
    else
      v_amount := greatest(0, v_amount - v_coupon.discount_value);
    end if;
    v_coupon_id := v_coupon.id;
  end if;
  if p_team_id is not null and not exists (select 1 from public.race_teams t where t.id = p_team_id and t.race_id = p_race_id) then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;

  insert into public.registrations (
    organization_id, race_id, category_id, team_id, coupon_id, participant_name,
    participant_email, participant_phone, participant_birth_date, participant_sex,
    amount_cents, status, privacy_consent_at, privacy_policy_version, expires_at, source, created_by_user_id
  ) values (
    v_race.organization_id, p_race_id, p_category_id, p_team_id, v_coupon_id,
    trim(p_participant_name), lower(trim(p_participant_email)), coalesce(trim(p_participant_phone), ''),
    p_birth_date, p_sex, v_amount, case when v_amount = 0 then 'courtesy' else 'pending' end,
    now(), trim(p_privacy_policy_version), case when v_amount = 0 then null else now() + interval '30 minutes' end,
    'manual', p_created_by_user_id
  ) returning id into v_registration_id;
  return query select v_registration_id, v_amount, v_recipient_id;
end;
$$;

revoke all on function public.prevent_duplicate_active_registration() from public, anon, authenticated;
revoke all on function public.create_manual_registration(uuid, uuid, uuid, text, text, text, text, date, text, uuid, text) from public, anon;
grant execute on function public.create_manual_registration(uuid, uuid, uuid, text, text, text, text, date, text, uuid, text) to authenticated;
