create extension if not exists pgcrypto;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now()
);

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete restrict,
  role text not null check (role in ('platform_admin', 'organizer')),
  created_at timestamptz not null default now(),
  check ((role = 'organizer' and organization_id is not null) or (role = 'platform_admin' and organization_id is null))
);

create table public.races (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text not null default '',
  location text not null default '',
  starts_at timestamptz not null,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, organization_id),
  check (registration_opens_at is null or registration_closes_at is null or registration_opens_at < registration_closes_at)
);

create table public.race_categories (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  price_cents integer not null check (price_cents >= 0),
  capacity integer not null check (capacity > 0),
  created_at timestamptz not null default now(),
  unique (race_id, name),
  unique (id, race_id)
);

create table public.race_teams (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  created_at timestamptz not null default now(),
  unique (race_id, name),
  unique (id, race_id)
);

create table public.race_coupons (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  code text not null check (code ~ '^[A-Z0-9_-]{2,32}$'),
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value integer not null check (discount_value > 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (race_id, code),
  unique (id, race_id),
  check (discount_type != 'percentage' or discount_value <= 100)
);

create table public.race_coupon_teams (
  coupon_id uuid not null,
  race_id uuid not null,
  team_id uuid not null,
  primary key (coupon_id, team_id),
  foreign key (coupon_id, race_id) references public.race_coupons(id, race_id) on delete cascade,
  foreign key (team_id, race_id) references public.race_teams(id, race_id) on delete cascade
);

create table public.courtesy_rules (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  team_id uuid not null,
  coupon_id uuid not null,
  paid_entries_required integer not null check (paid_entries_required > 0),
  maximum_courtesies integer not null check (maximum_courtesies > 0),
  created_at timestamptz not null default now(),
  unique (race_id, team_id, coupon_id),
  foreign key (team_id, race_id) references public.race_teams(id, race_id) on delete cascade,
  foreign key (coupon_id, race_id) references public.race_coupons(id, race_id) on delete cascade
);

create table public.registrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  race_id uuid not null,
  category_id uuid not null,
  team_id uuid,
  coupon_id uuid,
  participant_name text not null check (length(trim(participant_name)) between 2 and 160),
  participant_email text not null check (length(trim(participant_email)) <= 254),
  participant_phone text not null default '' check (length(participant_phone) <= 32),
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'courtesy', 'cancelled', 'expired')),
  privacy_consent_at timestamptz not null,
  privacy_policy_version text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (race_id, organization_id) references public.races(id, organization_id) on delete cascade,
  foreign key (category_id, race_id) references public.race_categories(id, race_id) on delete restrict,
  foreign key (team_id, race_id) references public.race_teams(id, race_id) on delete restrict,
  foreign key (coupon_id, race_id) references public.race_coupons(id, race_id) on delete restrict
);

create index registrations_race_status_idx on public.registrations (race_id, status);
create index registrations_organization_created_idx on public.registrations (organization_id, created_at desc);
create index registrations_email_idx on public.registrations (lower(participant_email));

create or replace function public.prevent_capacity_below_active_registrations()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_reserved bigint;
begin
  if new.capacity < old.capacity then
    select count(*) into v_reserved
    from public.registrations r
    where r.category_id = old.id
      and r.status in ('pending', 'paid', 'courtesy')
      and (r.status != 'pending' or r.expires_at > now());
    if new.capacity < v_reserved then
      raise exception 'capacity_below_active_registrations' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger race_category_capacity_guard
before update of capacity on public.race_categories
for each row execute function public.prevent_capacity_below_active_registrations();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null unique references public.registrations(id) on delete cascade,
  provider text not null default 'mercado_pago' check (provider = 'mercado_pago'),
  provider_preference_id text,
  provider_payment_id text unique,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back')),
  amount_cents integer not null check (amount_cents >= 0),
  status_detail text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.courtesy_grants (
  id uuid primary key default gen_random_uuid(),
  rule_id uuid not null references public.courtesy_rules(id) on delete restrict,
  registration_id uuid not null unique references public.registrations(id) on delete restrict,
  granted_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create or replace function public.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id
  from public.user_profiles
  where user_id = (select auth.uid())
    and role = 'organizer'
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_profiles
    where user_id = (select auth.uid())
      and role = 'platform_admin'
  )
$$;

create or replace function public.is_race_registration_open(p_race_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.races r
    where r.id = p_race_id
      and r.published
      and (r.registration_opens_at is null or now() >= r.registration_opens_at)
      and (
        (r.registration_closes_at is not null and now() < r.registration_closes_at)
        or (r.registration_closes_at is null and now() < r.starts_at)
      )
  )
$$;

create or replace function public.create_public_registration(
  p_race_id uuid,
  p_category_id uuid,
  p_team_id uuid,
  p_coupon_code text,
  p_participant_name text,
  p_participant_email text,
  p_participant_phone text,
  p_privacy_policy_version text
)
returns table (registration_id uuid, amount_cents integer, coupon_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_race public.races%rowtype;
  v_category public.race_categories%rowtype;
  v_coupon public.race_coupons%rowtype;
  v_organization_id uuid;
  v_amount integer;
  v_redeemed bigint;
  v_coupon_id uuid;
  v_registration_id uuid;
begin
  if length(trim(p_participant_name)) not between 2 and 160
     or length(trim(p_participant_email)) not between 3 and 254
     or (p_participant_phone is not null and length(p_participant_phone) > 32)
     or length(trim(p_privacy_policy_version)) not between 1 and 32 then
    raise exception 'invalid_registration_data' using errcode = '22023';
  end if;

  select * into v_race
  from public.races
  where id = p_race_id and published
  for share;
  if not found then
    raise exception 'race_not_available' using errcode = 'P0002';
  end if;

  if (v_race.registration_opens_at is not null and now() < v_race.registration_opens_at)
     or (v_race.registration_closes_at is not null and now() >= v_race.registration_closes_at)
     or (v_race.registration_closes_at is null and now() >= v_race.starts_at) then
    raise exception 'registration_closed' using errcode = 'P0001';
  end if;

  select * into v_category
  from public.race_categories
  where id = p_category_id and race_id = p_race_id
  for update;
  if not found then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;

  if p_team_id is not null and not exists (
    select 1 from public.race_teams where id = p_team_id and race_id = p_race_id
  ) then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;

  if (
    select count(*) from public.registrations r
    where r.category_id = p_category_id
      and r.status in ('pending', 'paid', 'courtesy')
      and (r.status != 'pending' or r.expires_at > now())
  ) >= v_category.capacity then
    raise exception 'category_full' using errcode = 'P0001';
  end if;

  v_amount := v_category.price_cents;
  if nullif(trim(p_coupon_code), '') is not null then
    select c.* into v_coupon
    from public.race_coupons c
    where c.race_id = p_race_id
      and c.code = upper(trim(p_coupon_code))
      and c.enabled
    for update;
    if not found then
      raise exception 'coupon_invalid' using errcode = 'P0001';
    end if;

    if p_team_id is null and exists (
      select 1 from public.race_coupon_teams ct where ct.coupon_id = v_coupon.id
    ) then
      raise exception 'coupon_team_required' using errcode = 'P0001';
    end if;

    if p_team_id is not null and exists (
      select 1 from public.race_coupon_teams ct where ct.coupon_id = v_coupon.id
    ) and not exists (
      select 1 from public.race_coupon_teams ct
      where ct.coupon_id = v_coupon.id and ct.team_id = p_team_id
    ) then
      raise exception 'coupon_not_allowed_for_team' using errcode = 'P0001';
    end if;

    select count(*) into v_redeemed
    from public.registrations r
    where r.coupon_id = v_coupon.id
      and r.status in ('pending', 'paid', 'courtesy')
      and (r.status != 'pending' or r.expires_at > now());
    if v_coupon.usage_limit is not null and v_redeemed >= v_coupon.usage_limit then
      raise exception 'coupon_limit_reached' using errcode = 'P0001';
    end if;

    if v_coupon.discount_type = 'percentage' then
      v_amount := greatest(0, v_amount - floor(v_amount::numeric * v_coupon.discount_value / 100)::integer);
    else
      v_amount := greatest(0, v_amount - v_coupon.discount_value);
    end if;
    v_coupon_id := v_coupon.id;
  end if;

  v_organization_id := v_race.organization_id;
  insert into public.registrations (
    organization_id, race_id, category_id, team_id, coupon_id,
    participant_name, participant_email, participant_phone, amount_cents,
    status, privacy_consent_at, privacy_policy_version, expires_at
  ) values (
    v_organization_id, p_race_id, p_category_id, p_team_id, v_coupon_id,
    trim(p_participant_name), lower(trim(p_participant_email)), coalesce(trim(p_participant_phone), ''), v_amount,
    case when v_amount = 0 then 'courtesy' else 'pending' end,
    now(), trim(p_privacy_policy_version),
    case when v_amount = 0 then null else now() + interval '30 minutes' end
  ) returning id into v_registration_id;

  return query select v_registration_id, v_amount, v_coupon_id;
end;
$$;

create or replace function public.record_mercado_pago_notification(
  p_registration_id uuid,
  p_provider_payment_id text,
  p_status text,
  p_amount_cents integer,
  p_status_detail text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations%rowtype;
  v_existing_registration_id uuid;
begin
  if p_provider_payment_id is null or p_provider_payment_id = ''
     or p_status not in ('pending', 'approved', 'rejected', 'cancelled', 'refunded', 'charged_back')
     or p_amount_cents < 0 then
    raise exception 'invalid_payment_notification' using errcode = '22023';
  end if;

  select registration_id into v_existing_registration_id
  from public.payments where provider_payment_id = p_provider_payment_id;
  if v_existing_registration_id is not null and v_existing_registration_id != p_registration_id then
    raise exception 'payment_registration_mismatch' using errcode = '23505';
  end if;

  select * into v_registration
  from public.registrations
  where id = p_registration_id
  for update;
  if not found then
    raise exception 'registration_not_found' using errcode = 'P0002';
  end if;

  if p_amount_cents != v_registration.amount_cents then
    raise exception 'payment_amount_mismatch' using errcode = '22023';
  end if;

  insert into public.payments (
    registration_id, provider_payment_id, status, amount_cents, status_detail, updated_at
  ) values (
    p_registration_id, p_provider_payment_id, p_status, p_amount_cents, p_status_detail, now()
  )
  on conflict (registration_id) do update set
    provider_payment_id = excluded.provider_payment_id,
    status = case
      when public.payments.status in ('refunded', 'charged_back')
        and excluded.status not in ('refunded', 'charged_back')
      then public.payments.status
      when public.payments.status = 'approved'
        and excluded.status not in ('refunded', 'charged_back')
      then public.payments.status
      else excluded.status
    end,
    status_detail = excluded.status_detail,
    updated_at = now()
  where public.payments.provider_payment_id is null
     or public.payments.provider_payment_id = excluded.provider_payment_id;

  if p_status = 'approved' then
    if v_registration.status = 'pending' and v_registration.expires_at > now() then
      update public.registrations set status = 'paid', expires_at = null where id = p_registration_id;
    elsif v_registration.status = 'pending' then
      update public.registrations set status = 'expired' where id = p_registration_id;
    elsif v_registration.status not in ('paid', 'courtesy', 'expired', 'cancelled') then
      raise exception 'registration_not_payable' using errcode = 'P0001';
    end if;
  elsif p_status in ('refunded', 'charged_back') then
    update public.registrations set status = 'cancelled' where id = p_registration_id and status = 'paid';
  end if;
end;
$$;

create or replace function public.save_mercado_pago_preference(
  p_registration_id uuid,
  p_preference_id text,
  p_amount_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations%rowtype;
begin
  select * into v_registration
  from public.registrations
  where id = p_registration_id
  for update;
  if not found or p_preference_id is null or p_preference_id = ''
     or v_registration.amount_cents != p_amount_cents
     or v_registration.status not in ('pending', 'paid') then
    raise exception 'invalid_payment_preference' using errcode = '22023';
  end if;

  insert into public.payments (
    registration_id, provider_preference_id, amount_cents, updated_at
  ) values (
    p_registration_id, p_preference_id, p_amount_cents, now()
  )
  on conflict (registration_id) do update set
    provider_preference_id = excluded.provider_preference_id,
    updated_at = now()
  where public.payments.provider_preference_id is null;
end;
$$;

create or replace function public.grant_courtesy(
  p_rule_id uuid,
  p_category_id uuid,
  p_participant_name text,
  p_participant_email text,
  p_privacy_policy_version text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule public.courtesy_rules%rowtype;
  v_race public.races%rowtype;
  v_category public.race_categories%rowtype;
  v_paid_count bigint;
  v_granted_count bigint;
  v_registration_id uuid;
begin
  if not exists (
    select 1 from public.user_profiles up
    join public.races r on r.organization_id = up.organization_id
    join public.courtesy_rules cr on cr.race_id = r.id
    where up.user_id = (select auth.uid())
      and up.role = 'organizer'
      and cr.id = p_rule_id
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into v_rule from public.courtesy_rules where id = p_rule_id for update;
  select * into v_race from public.races where id = v_rule.race_id;
  select * into v_category from public.race_categories
  where id = p_category_id and race_id = v_rule.race_id for update;
  if not found then
    raise exception 'category_not_found' using errcode = 'P0002';
  end if;
  if length(trim(p_participant_name)) not between 2 and 160
     or length(trim(p_participant_email)) not between 3 and 254
     or length(trim(p_privacy_policy_version)) not between 1 and 32 then
    raise exception 'invalid_registration_data' using errcode = '22023';
  end if;

  select count(*) into v_paid_count
  from public.registrations r
  join public.payments p on p.registration_id = r.id
  where r.race_id = v_rule.race_id
    and r.team_id = v_rule.team_id
    and r.coupon_id = v_rule.coupon_id
    and r.status = 'paid'
    and p.status = 'approved';

  select count(*) into v_granted_count
  from public.courtesy_grants cg where cg.rule_id = v_rule.id;

  if least(v_rule.maximum_courtesies, floor(v_paid_count / v_rule.paid_entries_required)) <= v_granted_count then
    raise exception 'courtesy_not_earned' using errcode = 'P0001';
  end if;

  if (
    select count(*) from public.registrations r
    where r.category_id = p_category_id
      and r.status in ('pending', 'paid', 'courtesy')
      and (r.status != 'pending' or r.expires_at > now())
  ) >= v_category.capacity then
    raise exception 'category_full' using errcode = 'P0001';
  end if;

  insert into public.registrations (
    organization_id, race_id, category_id, team_id, coupon_id,
    participant_name, participant_email, amount_cents, status,
    privacy_consent_at, privacy_policy_version
  ) values (
    v_race.organization_id, v_rule.race_id, p_category_id, v_rule.team_id, v_rule.coupon_id,
    trim(p_participant_name), lower(trim(p_participant_email)), 0, 'courtesy',
    now(), trim(p_privacy_policy_version)
  ) returning id into v_registration_id;

  insert into public.courtesy_grants (rule_id, registration_id, granted_by)
  values (v_rule.id, v_registration_id, (select auth.uid()));

  return v_registration_id;
end;
$$;

create or replace function public.create_race_coupon(
  p_race_id uuid,
  p_code text,
  p_discount_type text,
  p_discount_value integer,
  p_usage_limit integer,
  p_team_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_coupon_id uuid;
begin
  if not exists (
    select 1
    from public.races r
    join public.user_profiles up on up.user_id = (select auth.uid())
    where r.id = p_race_id
      and (up.role = 'platform_admin' or (up.role = 'organizer' and up.organization_id = r.organization_id))
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_discount_type not in ('percentage', 'fixed')
     or p_discount_value <= 0
     or (p_discount_type = 'percentage' and p_discount_value > 100)
     or (p_usage_limit is not null and p_usage_limit <= 0)
     or length(trim(p_code)) not between 2 and 32
     or upper(trim(p_code)) !~ '^[A-Z0-9_-]+$' then
    raise exception 'invalid_coupon' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(p_team_ids, array[]::uuid[])) submitted(id)
    where not exists (
      select 1 from public.race_teams t
      where t.id = submitted.id and t.race_id = p_race_id
    )
  ) then
    raise exception 'coupon_team_not_in_race' using errcode = '22023';
  end if;

  insert into public.race_coupons (race_id, code, discount_type, discount_value, usage_limit)
  values (p_race_id, upper(trim(p_code)), p_discount_type, p_discount_value, p_usage_limit)
  returning id into v_coupon_id;

  insert into public.race_coupon_teams (coupon_id, race_id, team_id)
  select v_coupon_id, p_race_id, submitted.id
  from unnest(coalesce(p_team_ids, array[]::uuid[])) submitted(id);

  return v_coupon_id;
end;
$$;

create or replace function public.create_courtesy_rule(
  p_race_id uuid,
  p_team_id uuid,
  p_coupon_id uuid,
  p_paid_entries_required integer,
  p_maximum_courtesies integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule_id uuid;
begin
  if not exists (
    select 1
    from public.races r
    join public.user_profiles up on up.user_id = (select auth.uid())
    where r.id = p_race_id
      and (up.role = 'platform_admin' or (up.role = 'organizer' and up.organization_id = r.organization_id))
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if not exists (select 1 from public.race_teams where id = p_team_id and race_id = p_race_id)
     or not exists (select 1 from public.race_coupons where id = p_coupon_id and race_id = p_race_id)
     or (exists (select 1 from public.race_coupon_teams where coupon_id = p_coupon_id)
         and not exists (select 1 from public.race_coupon_teams where coupon_id = p_coupon_id and team_id = p_team_id))
     or p_paid_entries_required <= 0
     or p_maximum_courtesies <= 0 then
    raise exception 'invalid_courtesy_rule' using errcode = '22023';
  end if;

  insert into public.courtesy_rules (
    race_id, team_id, coupon_id, paid_entries_required, maximum_courtesies
  ) values (
    p_race_id, p_team_id, p_coupon_id, p_paid_entries_required, p_maximum_courtesies
  ) returning id into v_rule_id;

  return v_rule_id;
end;
$$;

create or replace function public.get_courtesy_progress(p_race_id uuid)
returns table (
  rule_id uuid,
  paid_count bigint,
  granted_count bigint,
  eligible_count bigint,
  remaining_to_next bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select cr.id,
    coalesce(paid.paid_count, 0)::bigint as paid_count,
    count(distinct cg.id)::bigint as granted_count,
    least(
      cr.maximum_courtesies::bigint,
      floor(coalesce(paid.paid_count, 0)::numeric / cr.paid_entries_required)::bigint
    ) as eligible_count,
    case
      when least(
        cr.maximum_courtesies::bigint,
        floor(coalesce(paid.paid_count, 0)::numeric / cr.paid_entries_required)::bigint
      ) >= cr.maximum_courtesies then 0
      else cr.paid_entries_required - (coalesce(paid.paid_count, 0)::integer % cr.paid_entries_required)
    end as remaining_to_next
  from public.courtesy_rules cr
  left join lateral (
    select count(*)::bigint as paid_count
    from public.registrations r
    join public.payments p on p.registration_id = r.id
    where r.race_id = cr.race_id
      and r.team_id = cr.team_id
      and r.coupon_id = cr.coupon_id
      and r.status = 'paid'
      and p.status = 'approved'
  ) paid on true
  left join public.courtesy_grants cg on cg.rule_id = cr.id
  where cr.race_id = p_race_id
  group by cr.id, paid.paid_count
$$;

alter table public.organizations enable row level security;
alter table public.user_profiles enable row level security;
alter table public.races enable row level security;
alter table public.race_categories enable row level security;
alter table public.race_teams enable row level security;
alter table public.race_coupons enable row level security;
alter table public.race_coupon_teams enable row level security;
alter table public.courtesy_rules enable row level security;
alter table public.registrations enable row level security;
alter table public.payments enable row level security;
alter table public.courtesy_grants enable row level security;

create policy "Organizers read their organization"
on public.organizations for select
using (id = (select public.current_organization_id()) or (select public.is_platform_admin()));

create policy "Users read their own profile"
on public.user_profiles for select
using (user_id = (select auth.uid()) or (select public.is_platform_admin()));

create policy "Organizers manage their races"
on public.races for all
using (organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()))
with check (organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()));

create policy "Public can read published races"
on public.races for select
using (published);

create policy "Organizers manage race categories"
on public.race_categories for all
using (exists (
  select 1 from public.races r
  where r.id = race_id
    and (r.organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()))
))
with check (exists (
  select 1 from public.races r
  where r.id = race_id
    and (r.organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()))
));

create policy "Public can read categories of published races"
on public.race_categories for select
using (exists (select 1 from public.races r where r.id = race_id and r.published));

create policy "Organizers manage race teams"
on public.race_teams for all
using (exists (
  select 1 from public.races r
  where r.id = race_id
    and (r.organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()))
))
with check (exists (
  select 1 from public.races r
  where r.id = race_id
    and (r.organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()))
));

create policy "Public can read teams of published races"
on public.race_teams for select
using (exists (select 1 from public.races r where r.id = race_id and r.published));

create policy "Organizers manage coupons"
on public.race_coupons for all
using (exists (
  select 1 from public.races r
  where r.id = race_id
    and (r.organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()))
))
with check (exists (
  select 1 from public.races r
  where r.id = race_id
    and (r.organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()))
));

create policy "Organizers manage coupon team limits"
on public.race_coupon_teams for all
using (exists (
  select 1 from public.races r
  where r.id = race_id
    and (r.organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()))
))
with check (exists (
  select 1 from public.races r
  where r.id = race_id
    and (r.organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()))
));

create policy "Organizers manage courtesy rules"
on public.courtesy_rules for all
using (exists (
  select 1 from public.races r
  where r.id = race_id
    and (r.organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()))
))
with check (exists (
  select 1 from public.races r
  where r.id = race_id
    and (r.organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()))
));

create policy "Organizers read registrations"
on public.registrations for select
using (organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()));

create policy "Organizers read payments"
on public.payments for select
using (exists (
  select 1 from public.registrations r
  where r.id = registration_id
    and (r.organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()))
));

create policy "Organizers read courtesy grants"
on public.courtesy_grants for select
using (exists (
  select 1 from public.registrations r
  where r.id = registration_id
    and (r.organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()))
));

revoke all on function public.create_public_registration(uuid, uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_public_registration(uuid, uuid, uuid, text, text, text, text, text) to service_role;
revoke all on function public.is_race_registration_open(uuid) from public;
grant execute on function public.is_race_registration_open(uuid) to anon, authenticated;
revoke all on function public.record_mercado_pago_notification(uuid, text, text, integer, text) from public, anon, authenticated;
grant execute on function public.record_mercado_pago_notification(uuid, text, text, integer, text) to service_role;
revoke all on function public.save_mercado_pago_preference(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.save_mercado_pago_preference(uuid, text, integer) to service_role;
revoke all on function public.grant_courtesy(uuid, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.grant_courtesy(uuid, uuid, text, text, text) to authenticated, service_role;
revoke all on function public.create_race_coupon(uuid, text, text, integer, integer, uuid[]) from public, anon, authenticated;
grant execute on function public.create_race_coupon(uuid, text, text, integer, integer, uuid[]) to authenticated, service_role;
revoke all on function public.create_courtesy_rule(uuid, uuid, uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.create_courtesy_rule(uuid, uuid, uuid, integer, integer) to authenticated, service_role;
revoke all on function public.get_courtesy_progress(uuid) from public, anon;
grant execute on function public.get_courtesy_progress(uuid) to authenticated;

grant usage on schema public to anon, authenticated, service_role;
grant select on public.races, public.race_categories, public.race_teams to anon, authenticated;
grant select on public.organizations, public.user_profiles, public.race_coupons,
  public.race_coupon_teams, public.courtesy_rules, public.registrations,
  public.payments, public.courtesy_grants to authenticated;
grant insert, update, delete on public.races, public.race_categories, public.race_teams,
  public.race_coupons, public.race_coupon_teams, public.courtesy_rules to authenticated;
grant all on public.organizations, public.user_profiles, public.races,
  public.race_categories, public.race_teams, public.race_coupons,
  public.race_coupon_teams, public.courtesy_rules, public.registrations,
  public.payments, public.courtesy_grants to service_role;
