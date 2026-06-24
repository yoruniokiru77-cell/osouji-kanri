alter table public.work_reports
  add column if not exists current_cash_balance numeric(12, 0);

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
      and current_cash_balance is not null
      and change_amount is not null
      and cash_collected_amount is not null
      and previous_change_amount >= 0
      and current_cash_balance >= 0
      and change_amount >= 0
      and cash_collected_amount >= 0
      and cash_collected_amount <= current_cash_balance
      and change_amount = current_cash_balance - cash_collected_amount
    )
    or payment_method in ('invoice', 'other')
  );
