alter table public.payments
  alter column provider set default 'safe2pay';

alter table public.payments
  drop constraint if exists payments_provider_check;

alter table public.payments
  add constraint payments_provider_check check (provider in ('pagarme', 'safe2pay'));

alter table public.payments
  add column if not exists provider_reference text unique,
  add column if not exists callback_token_hash text unique,
  add column if not exists pix_copy_paste text,
  add column if not exists pix_qr_code_url text,
  add column if not exists expires_at timestamptz,
  add column if not exists gateway_fee_cents integer check (gateway_fee_cents is null or gateway_fee_cents >= 0),
  add column if not exists net_amount_cents integer check (net_amount_cents is null or net_amount_cents >= 0),
  add column if not exists provider_status_code text,
  add column if not exists provider_status_message text;

create table public.safe2pay_settings (
  singleton boolean primary key default true check (singleton),
  payments_enabled boolean not null default false,
  platform_receiver_id bigint check (platform_receiver_id is null or platform_receiver_id > 0),
  payout_frequency_code text check (payout_frequency_code is null or payout_frequency_code in ('1', '6', '7')),
  payout_day integer check (payout_day is null or payout_day between 1 and 31),
  marketplace_ready_acknowledged boolean not null default false,
  fee_policy_acknowledged boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  check (
    not payments_enabled
    or (
      platform_receiver_id is not null
      and payout_frequency_code is not null
      and marketplace_ready_acknowledged
      and (
        (payout_frequency_code = '7' and payout_day is null)
        or (payout_frequency_code = '6' and payout_day between 2 and 6)
        or (payout_frequency_code = '1' and payout_day between 1 and 31)
      )
      and fee_policy_acknowledged
    )
  )
);

insert into public.safe2pay_settings (singleton)
values (true)
on conflict (singleton) do nothing;

create table public.safe2pay_subaccounts (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  safe2pay_subaccount_id bigint not null unique check (safe2pay_subaccount_id > 0),
  account_type text not null check (account_type in ('individual', 'company')),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'active', 'suspended')),
  verified_at timestamptz,
  activated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.safe2pay_webhook_events (
  id bigint generated always as identity primary key,
  payment_id uuid not null references public.payments(id) on delete restrict,
  provider_payment_id text not null,
  provider_status text not null
    check (provider_status in ('pending', 'approved', 'rejected', 'cancelled', 'expired', 'refunded')),
  provider_status_code text not null,
  provider_status_message text not null,
  received_at timestamptz not null default now(),
  unique (payment_id, provider_status, provider_status_code)
);

create table public.safe2pay_commission_ledger (
  id bigint generated always as identity primary key,
  payment_id uuid not null references public.payments(id) on delete restrict,
  entry_type text not null check (entry_type in ('commission', 'reversal')),
  amount_cents integer not null check (amount_cents <> 0),
  created_at timestamptz not null default now(),
  unique (payment_id, entry_type),
  check (
    (entry_type = 'commission' and amount_cents > 0)
    or (entry_type = 'reversal' and amount_cents < 0)
  )
);

create index safe2pay_webhook_events_payment_received_idx
  on public.safe2pay_webhook_events (payment_id, received_at desc);
create index safe2pay_commission_ledger_created_idx
  on public.safe2pay_commission_ledger (created_at desc);

alter table public.safe2pay_settings enable row level security;
alter table public.safe2pay_subaccounts enable row level security;
alter table public.safe2pay_webhook_events enable row level security;
alter table public.safe2pay_commission_ledger enable row level security;

create policy "Platform admins read Safe2Pay settings"
on public.safe2pay_settings for select
using ((select public.is_platform_admin()));

create policy "Organizers and platform admins read Safe2Pay subaccounts"
on public.safe2pay_subaccounts for select
using (
  organization_id = (select public.current_organization_id())
  or (select public.is_platform_admin())
);

create policy "Organizers and platform admins read Safe2Pay ledger"
on public.safe2pay_commission_ledger for select
using (
  (select public.is_platform_admin())
  or exists (
    select 1
    from public.payments p
    join public.registrations r on r.id = p.registration_id
    where p.id = safe2pay_commission_ledger.payment_id
      and r.organization_id = (select public.current_organization_id())
  )
);

grant select on public.safe2pay_settings, public.safe2pay_subaccounts,
  public.safe2pay_commission_ledger to authenticated;

