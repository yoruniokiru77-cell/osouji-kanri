drop view if exists public.finance_monthly_summary;

create view public.finance_monthly_summary as
with approved_reservations as (
  select
    r.id,
    date_trunc('month', r.scheduled_at at time zone 'Asia/Tokyo')::date as month_start,
    r.amount::numeric as amount,
    coalesce(
      (
        select wr.payment_method
        from public.work_reports wr
        where wr.reservation_id = r.id
          and wr.approval_status = 'approved'
        order by wr.reviewed_at desc nulls last, wr.created_at desc
        limit 1
      ),
      'other'
    ) as payment_method
  from public.reservations r
  where r.status = 'completed'
    and exists (
      select 1
      from public.work_reports wr
      where wr.reservation_id = r.id
        and wr.approval_status = 'approved'
    )
),
reservation_worker_basis as (
  select
    ar.id as reservation_id,
    ar.month_start,
    ar.amount,
    rw.is_supporter,
    w.id as worker_id,
    w.name as worker_name,
    w.worker_type,
    coalesce(rw.compensation_type, w.default_compensation_type) as compensation_type,
    coalesce(rw.compensation_value, w.default_compensation_value)::numeric as compensation_value,
    count(*) filter (where not rw.is_supporter) over (partition by ar.id) as normal_worker_count
  from approved_reservations ar
  join public.reservation_workers rw on rw.reservation_id = ar.id
  join public.workers w on w.id = rw.worker_id
),
supporter_fixed_costs as (
  select
    reservation_id,
    sum(
      case
        when is_supporter and compensation_type = 'fixed' then compensation_value
        else 0
      end
    ) as supporter_fixed_cost
  from reservation_worker_basis
  group by reservation_id
),
worker_amounts as (
  select
    rwb.month_start,
    rwb.worker_name,
    rwb.worker_type,
    case
      when rwb.compensation_type = 'fixed' then rwb.compensation_value
      when rwb.is_supporter then floor(rwb.amount) * (rwb.compensation_value / 100)
      else floor(greatest(0, rwb.amount - coalesce(sfc.supporter_fixed_cost, 0)) / greatest(1, rwb.normal_worker_count)) * (rwb.compensation_value / 100)
    end as amount
  from reservation_worker_basis rwb
  left join supporter_fixed_costs sfc on sfc.reservation_id = rwb.reservation_id
),
sales_by_month as (
  select
    month_start,
    count(*)::integer as completed_reservations,
    sum(amount)::numeric as total_sales,
    sum(amount) filter (where payment_method = 'cash')::numeric as cash_sales,
    sum(amount) filter (where payment_method = 'card')::numeric as card_sales,
    sum(amount) filter (where payment_method = 'invoice')::numeric as invoice_sales,
    sum(amount) filter (where payment_method = 'other')::numeric as other_sales
  from approved_reservations
  group by month_start
),
payroll_by_month as (
  select
    month_start,
    sum(amount) filter (where worker_type = 'employee')::numeric as total_payroll,
    sum(amount) filter (
      where worker_type = 'employee'
        and worker_name not like '%坂場%'
        and worker_name not like '%雨谷%'
    )::numeric as deductible_payroll,
    sum(amount) filter (where worker_type = 'contractor')::numeric as total_contractor_costs
  from worker_amounts
  group by month_start
),
expense_months as (
  select distinct
    e.id as expense_id,
    date_trunc(
      'month',
      coalesce(r.scheduled_at, e.created_at) at time zone 'Asia/Tokyo'
    )::date as month_start
  from public.expenses e
  left join public.expense_reservations er on er.expense_id = e.id
  left join public.reservations r on r.id = coalesce(er.reservation_id, e.reservation_id)
),
expenses_by_month as (
  select
    em.month_start,
    count(*) filter (where e.status = 'requested')::integer as requested_expenses,
    count(*) filter (where e.status = 'approved')::integer as approved_expenses,
    count(*) filter (where e.status = 'purchased')::integer as purchased_expense_count,
    sum(e.amount) filter (where e.status = 'purchased')::numeric as purchased_expenses
  from expense_months em
  join public.expenses e on e.id = em.expense_id
  group by em.month_start
),
reports_by_month as (
  select
    date_trunc('month', r.scheduled_at at time zone 'Asia/Tokyo')::date as month_start,
    count(*) filter (where wr.approval_status = 'pending')::integer as pending_reports,
    count(*) filter (where wr.approval_status = 'approved')::integer as approved_reports,
    count(*) filter (where wr.approval_status = 'rejected')::integer as rejected_reports
  from public.work_reports wr
  join public.reservations r on r.id = wr.reservation_id
  group by month_start
),
months as (
  select month_start from sales_by_month
  union
  select month_start from payroll_by_month
  union
  select month_start from expenses_by_month
  union
  select month_start from reports_by_month
)
select
  to_char(m.month_start, 'YYYY-MM') as month,
  m.month_start,
  coalesce(s.completed_reservations, 0) as completed_reservations,
  coalesce(r.pending_reports, 0) as pending_reports,
  coalesce(r.approved_reports, 0) as approved_reports,
  coalesce(r.rejected_reports, 0) as rejected_reports,
  coalesce(e.requested_expenses, 0) as requested_expenses,
  coalesce(e.approved_expenses, 0) as approved_expenses,
  coalesce(e.purchased_expense_count, 0) as purchased_expense_count,
  coalesce(s.total_sales, 0) as total_sales,
  coalesce(s.cash_sales, 0) as cash_sales,
  coalesce(s.card_sales, 0) as card_sales,
  coalesce(s.invoice_sales, 0) as invoice_sales,
  coalesce(s.other_sales, 0) as other_sales,
  coalesce(p.total_payroll, 0) as total_payroll,
  coalesce(p.deductible_payroll, 0) as deductible_payroll,
  coalesce(p.total_contractor_costs, 0) as total_contractor_costs,
  coalesce(e.purchased_expenses, 0) as purchased_expenses,
  coalesce(s.total_sales, 0)
    - (
      coalesce(p.deductible_payroll, 0)
      + coalesce(p.total_contractor_costs, 0)
      + coalesce(e.purchased_expenses, 0)
    ) as net_profit
from months m
left join sales_by_month s on s.month_start = m.month_start
left join payroll_by_month p on p.month_start = m.month_start
left join expenses_by_month e on e.month_start = m.month_start
left join reports_by_month r on r.month_start = m.month_start
where public.is_admin()
order by m.month_start desc;

grant select on public.finance_monthly_summary to authenticated;

notify pgrst, 'reload schema';
