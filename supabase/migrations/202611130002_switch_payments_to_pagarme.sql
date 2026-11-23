alter table public.payments
  alter column provider set default 'pagarme';

alter table public.payments
  drop constraint if exists payments_provider_check;

update public.payments set provider = 'pagarme' where provider <> 'pagarme';

alter table public.payments
  add constraint payments_provider_check check (provider = 'pagarme');

alter function public.save_mercado_pago_preference(uuid, text, integer)
  rename to save_pagarme_checkout;

alter function public.record_mercado_pago_notification(uuid, text, text, integer, text)
  rename to record_pagarme_notification;
