alter table public.work_reports
  add column if not exists payment_method text not null default 'other',
  add column if not exists card_statement_url text,
  add column if not exists previous_change_amount numeric(12, 0),
  add column if not exists change_amount numeric(12, 0),
  add column if not exists cash_collected_amount numeric(12, 0);

alter table public.work_reports
  drop constraint if exists work_reports_payment_method_check;
alter table public.work_reports
  add constraint work_reports_payment_method_check
  check (payment_method in ('cash', 'card', 'invoice', 'other'));

alter table public.work_reports
  drop constraint if exists work_reports_payment_details_check;
alter table public.work_reports
  add constraint work_reports_payment_details_check
  check (
    (payment_method = 'card' and card_statement_url is not null)
    or
    (
      payment_method = 'cash'
      and previous_change_amount is not null
      and change_amount is not null
      and cash_collected_amount is not null
      and previous_change_amount >= 0
      and change_amount >= 0
      and cash_collected_amount >= 0
      and cash_collected_amount = change_amount - previous_change_amount + reported_amount
    )
    or payment_method in ('invoice', 'other')
  );

insert into storage.buckets (id, name, public)
values ('payment-statements', 'payment-statements', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "authenticated users read payment statements" on storage.objects;
create policy "authenticated users read payment statements"
on storage.objects for select
to authenticated
using (bucket_id = 'payment-statements');

drop policy if exists "staff upload own payment statements" on storage.objects;
create policy "staff upload own payment statements"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'payment-statements'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "staff update own payment statements" on storage.objects;
create policy "staff update own payment statements"
on storage.objects for update
to authenticated
using (
  bucket_id = 'payment-statements'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'payment-statements'
  and (storage.foldername(name))[1] = auth.uid()::text
);
