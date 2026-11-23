drop function if exists public.save_pagarme_checkout(uuid, text, integer);
drop function if exists public.record_pagarme_notification(uuid, text, text, integer, text);
drop function if exists public.save_pagarme_manual_payment(uuid, text, integer, integer, integer, boolean);

drop function if exists public.create_manual_registration(uuid, uuid, uuid, text, text, text, text, date, text, uuid, text);

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
returns table (registration_id uuid, amount_cents integer)
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
begin
  if length(trim(coalesce(p_participant_name, ''))) not between 2 and 160
     or length(trim(coalesce(p_participant_email, ''))) not between 3 and 254
     or p_birth_date is null or p_birth_date > current_date
     or (p_sex is not null and p_sex not in ('female', 'male', 'other', 'prefer_not_to_say')) then
    raise exception 'invalid_registration_data' using errcode = '22023';
  end if;

  select r.* into v_race
  from public.races r
  where r.id = p_race_id
    and (r.organization_id = (select public.current_organization_id()) or (select public.is_platform_admin()))
  for share;
  if not found then raise exception 'race_not_found' using errcode = 'P0002'; end if;

  update public.registrations r set status = 'expired'
  where r.race_id = p_race_id and r.status = 'pending' and r.expires_at <= now();

  select c.* into v_category
  from public.race_categories c where c.id = p_category_id and c.race_id = p_race_id for update;
  if not found then raise exception 'category_not_found' using errcode = 'P0002'; end if;

  if (select count(*) from public.registrations r
      where r.category_id = p_category_id and r.status in ('pending', 'paid', 'courtesy')
        and (r.status <> 'pending' or r.expires_at > now())) >= v_category.capacity then
    raise exception 'category_full' using errcode = 'P0001';
  end if;

  v_amount := v_category.price_cents;
  if nullif(trim(coalesce(p_coupon_code, '')), '') is not null then
    select c.* into v_coupon from public.race_coupons c
    where c.race_id = p_race_id and c.code = upper(trim(p_coupon_code)) and c.enabled for update;
    if not found then raise exception 'coupon_invalid' using errcode = 'P0001'; end if;
    if exists (select 1 from public.race_coupon_teams ct where ct.coupon_id = v_coupon.id)
      and (p_team_id is null or not exists (
        select 1 from public.race_coupon_teams ct
        where ct.coupon_id = v_coupon.id and ct.team_id = p_team_id
      )) then
      raise exception 'coupon_not_allowed_for_team' using errcode = 'P0001';
    end if;
    if p_team_id is not null and not exists (
      select 1 from public.race_teams t where t.id = p_team_id and t.race_id = p_race_id
    ) then
      raise exception 'team_not_found' using errcode = 'P0002';
    end if;
    select count(*) into v_usage_count from public.registrations r
    where r.coupon_id = v_coupon.id and r.status in ('pending', 'paid', 'courtesy')
      and (r.status <> 'pending' or r.expires_at > now());
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

  if p_team_id is not null and not exists (
    select 1 from public.race_teams t where t.id = p_team_id and t.race_id = p_race_id
  ) then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;

  insert into public.registrations (
    organization_id, race_id, category_id, team_id, coupon_id, participant_name,
    participant_email, participant_phone, participant_birth_date, participant_sex,
    amount_cents, status, privacy_consent_at, privacy_policy_version, expires_at,
    source, created_by_user_id
  ) values (
    v_race.organization_id, p_race_id, p_category_id, p_team_id, v_coupon_id,
    trim(p_participant_name), lower(trim(p_participant_email)), coalesce(trim(p_participant_phone), ''),
    p_birth_date, p_sex, v_amount,
    case when v_amount = 0 then 'courtesy' else 'pending' end,
    now(), trim(p_privacy_policy_version),
    case when v_amount = 0 then null else now() + interval '30 minutes' end,
    'manual', p_created_by_user_id
  ) returning id into v_registration_id;

  return query select v_registration_id, v_amount;
end;
$$;

drop policy if exists "Organizers configure their Pagar.me recipient" on public.organizations;
revoke update (pagarme_recipient_id) on public.organizations from authenticated;
alter table public.organizations drop column if exists pagarme_recipient_id;

create or replace function public.prepare_safe2pay_payment(
  p_registration_id uuid,
  p_reference text,
  p_callback_token_hash text
)
returns table (
  payment_id uuid,
  amount_cents integer,
  platform_fee_cents integer,
  organizer_amount_cents integer,
  organizer_receiver_id bigint,
  platform_receiver_id bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_registration public.registrations%rowtype;
  v_settings public.safe2pay_settings%rowtype;
  v_subaccount public.safe2pay_subaccounts%rowtype;
  v_platform_fee_cents integer;
  v_organizer_amount_cents integer;
  v_payment_id uuid;
begin
  if p_reference is null or length(p_reference) > 60
     or p_callback_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_safe2pay_payment_data' using errcode = '22023';
  end if;

  select r.* into v_registration
  from public.registrations r
  where r.id = p_registration_id
  for update;
  if not found or v_registration.status <> 'pending'
     or v_registration.amount_cents <= 0
     or v_registration.expires_at <= now() then
    raise exception 'registration_not_payable' using errcode = 'P0001';
  end if;

  select s.* into v_settings
  from public.safe2pay_settings s
  where s.singleton and s.payments_enabled
  for share;
  if not found or v_settings.platform_receiver_id is null
     or v_settings.payout_frequency_code is null
     or not v_settings.marketplace_ready_acknowledged
     or not v_settings.fee_policy_acknowledged then
    raise exception 'safe2pay_payments_unavailable' using errcode = 'P0001';
  end if;

  select s.* into v_subaccount
  from public.safe2pay_subaccounts s
  where s.organization_id = v_registration.organization_id and s.status = 'active'
  for share;
  if not found then
    raise exception 'safe2pay_subaccount_not_active' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.payments p where p.registration_id = p_registration_id) then
    raise exception 'payment_already_exists' using errcode = '23505';
  end if;

  v_platform_fee_cents := round(v_registration.amount_cents::numeric * 0.05)::integer;
  v_organizer_amount_cents := v_registration.amount_cents - v_platform_fee_cents;

  insert into public.payments (
    registration_id, provider, provider_reference, callback_token_hash, payment_method,
    status, amount_cents, platform_fee_cents, organizer_amount_cents,
    split_configured, status_detail, expires_at, updated_at
  ) values (
    p_registration_id, 'safe2pay', p_reference, p_callback_token_hash, 'pix',
    'pending', v_registration.amount_cents, v_platform_fee_cents, v_organizer_amount_cents,
    true, 'pix_creation_pending', v_registration.expires_at, now()
  ) returning id into v_payment_id;

  return query select v_payment_id, v_registration.amount_cents, v_platform_fee_cents,
    v_organizer_amount_cents, v_subaccount.safe2pay_subaccount_id, v_settings.platform_receiver_id;
end;
$$;

create or replace function public.save_safe2pay_charge(
  p_registration_id uuid,
  p_provider_payment_id text,
  p_amount_cents integer,
  p_pix_copy_paste text,
  p_pix_qr_code_url text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
begin
  select p.* into v_payment
  from public.payments p
  where p.registration_id = p_registration_id and p.provider = 'safe2pay'
  for update;
  if not found or p_provider_payment_id is null or p_provider_payment_id = ''
     or p_amount_cents <> v_payment.amount_cents
     or p_pix_copy_paste is null or p_pix_copy_paste = ''
     or p_pix_qr_code_url is null or p_pix_qr_code_url = ''
     or (v_payment.provider_payment_id is not null and v_payment.provider_payment_id <> p_provider_payment_id) then
    raise exception 'invalid_safe2pay_charge' using errcode = '22023';
  end if;

  update public.payments
  set provider_payment_id = p_provider_payment_id,
      pix_copy_paste = p_pix_copy_paste,
      pix_qr_code_url = p_pix_qr_code_url,
      status_detail = case when status = 'pending' then 'pix_created' else status_detail end,
      updated_at = now()
  where id = v_payment.id;
end;
$$;

create or replace function public.record_safe2pay_notification(
  p_callback_token_hash text,
  p_provider_payment_id text,
  p_provider_status text,
  p_provider_status_code text,
  p_provider_status_message text,
  p_amount_cents integer,
  p_gateway_fee_cents integer,
  p_net_amount_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_registration public.registrations%rowtype;
begin
  if p_callback_token_hash !~ '^[0-9a-f]{64}$'
     or p_provider_payment_id is null or p_provider_payment_id = ''
     or p_provider_status not in ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'refunded')
     or p_provider_status_code is null or p_provider_status_message is null
     or p_amount_cents < 0
     or (p_gateway_fee_cents is not null and p_gateway_fee_cents < 0)
     or (p_net_amount_cents is not null and p_net_amount_cents < 0) then
    raise exception 'invalid_safe2pay_notification' using errcode = '22023';
  end if;

  select p.* into v_payment
  from public.payments p
  where p.callback_token_hash = p_callback_token_hash and p.provider = 'safe2pay'
  for update;
  if not found then raise exception 'safe2pay_payment_not_found' using errcode = 'P0002'; end if;

  select r.* into v_registration
  from public.registrations r where r.id = v_payment.registration_id for update;
  if not found or v_payment.amount_cents <> p_amount_cents
     or (v_payment.provider_payment_id is not null and v_payment.provider_payment_id <> p_provider_payment_id) then
    raise exception 'safe2pay_payment_mismatch' using errcode = '22023';
  end if;

  insert into public.safe2pay_webhook_events (
    payment_id, provider_payment_id, provider_status, provider_status_code, provider_status_message
  ) values (
    v_payment.id, p_provider_payment_id, p_provider_status, p_provider_status_code, p_provider_status_message
  )
  on conflict (payment_id, provider_status, provider_status_code) do nothing;

  update public.payments
  set provider_payment_id = p_provider_payment_id,
      provider_status_code = p_provider_status_code,
      provider_status_message = p_provider_status_message,
      gateway_fee_cents = coalesce(p_gateway_fee_cents, gateway_fee_cents),
      net_amount_cents = coalesce(p_net_amount_cents, net_amount_cents),
      status_detail = p_provider_status_message,
      updated_at = now()
  where id = v_payment.id;

  if p_provider_status = 'approved' and v_payment.status in ('pending', 'approved') then
    update public.payments set status = 'approved' where id = v_payment.id;
    update public.registrations set status = 'paid'
    where id = v_registration.id and status in ('pending', 'paid');
    if v_payment.status = 'pending' and v_payment.platform_fee_cents > 0 then
      insert into public.safe2pay_commission_ledger (payment_id, entry_type, amount_cents)
      values (v_payment.id, 'commission', v_payment.platform_fee_cents)
      on conflict (payment_id, entry_type) do nothing;
    end if;
  elsif p_provider_status = 'refunded' and v_payment.status in ('pending', 'approved', 'refunded') then
    update public.payments set status = 'refunded' where id = v_payment.id;
    update public.registrations set status = 'cancelled'
    where id = v_registration.id and status in ('pending', 'paid');
    if v_payment.status = 'approved' and v_payment.platform_fee_cents > 0 then
      insert into public.safe2pay_commission_ledger (payment_id, entry_type, amount_cents)
      values (v_payment.id, 'reversal', -v_payment.platform_fee_cents)
      on conflict (payment_id, entry_type) do nothing;
    end if;
  elsif p_provider_status in ('rejected', 'cancelled', 'expired') and v_payment.status = 'pending' then
    update public.payments set status = case when p_provider_status = 'expired' then 'cancelled' else p_provider_status end
    where id = v_payment.id;
    update public.registrations
    set status = case when p_provider_status = 'expired' then 'expired' else 'cancelled' end
    where id = v_registration.id and status = 'pending';
  end if;
end;
$$;

create or replace function public.get_platform_finance_summary()
returns table (
  safe2pay_payment_count bigint,
  safe2pay_gross_cents bigint,
  safe2pay_commission_cents bigint,
  safe2pay_gateway_fee_cents bigint,
  historical_pagarme_payment_count bigint,
  historical_pagarme_amount_cents bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (select public.is_platform_admin()) then
    raise exception 'platform_admin_required' using errcode = '42501';
  end if;

  return query
  with payment_totals as (
    select
      count(*) filter (where p.provider = 'safe2pay')::bigint as safe2pay_payment_count,
      coalesce(sum(p.amount_cents) filter (where p.provider = 'safe2pay'), 0)::bigint as safe2pay_gross_cents,
      coalesce(sum(p.gateway_fee_cents) filter (where p.provider = 'safe2pay'), 0)::bigint as safe2pay_gateway_fee_cents,
      count(*) filter (where p.provider = 'pagarme')::bigint as historical_pagarme_payment_count,
      coalesce(sum(p.amount_cents) filter (where p.provider = 'pagarme'), 0)::bigint as historical_pagarme_amount_cents
    from public.payments p
  ),
  commission_totals as (
    select coalesce(sum(l.amount_cents), 0)::bigint as safe2pay_commission_cents
    from public.safe2pay_commission_ledger l
  )
  select p.safe2pay_payment_count, p.safe2pay_gross_cents,
    c.safe2pay_commission_cents, p.safe2pay_gateway_fee_cents,
    p.historical_pagarme_payment_count, p.historical_pagarme_amount_cents
  from payment_totals p cross join commission_totals c;
end;
$$;

revoke all on function public.create_manual_registration(uuid, uuid, uuid, text, text, text, text, date, text, uuid, text) from public, anon;
grant execute on function public.create_manual_registration(uuid, uuid, uuid, text, text, text, text, date, text, uuid, text) to authenticated;
revoke all on function public.prepare_safe2pay_payment(uuid, text, text) from public, anon, authenticated;
grant execute on function public.prepare_safe2pay_payment(uuid, text, text) to service_role;
revoke all on function public.save_safe2pay_charge(uuid, text, integer, text, text) from public, anon, authenticated;
grant execute on function public.save_safe2pay_charge(uuid, text, integer, text, text) to service_role;
revoke all on function public.record_safe2pay_notification(text, text, text, text, text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.record_safe2pay_notification(text, text, text, text, text, integer, integer, integer) to service_role;
revoke all on function public.get_platform_finance_summary() from public, anon;
grant execute on function public.get_platform_finance_summary() to authenticated;

