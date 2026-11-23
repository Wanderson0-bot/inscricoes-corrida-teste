alter table public.payments
  alter column provider set default 'asaas';

alter table public.payments
  drop constraint if exists payments_provider_check;

alter table public.payments
  add constraint payments_provider_check check (provider = 'asaas');

update public.payments set provider = 'asaas' where provider <> 'asaas';
