-- Repair unpaid manager records that were incorrectly overridden to 90%.
-- Apply salary_to_asd.sql and erp_activity_log.sql before this correction so
-- both the new rule and the repair are captured by the daily activity log.
update public.play_orders as target
set salary_rate = 95,
    staff_salary = round(coalesce(target.order_amount, 0) * 0.95),
    salary_level = case
      when coalesce(target.service_name, target.service, '') like '%打賞%'
        then '打賞特別設定 95%'
      else '主管指定 95%'
    end,
    platform_expense = round(coalesce(target.order_amount, 0) * 0.95)
      + coalesce(target.bonus_amount, 0)
from public.players as staff
where staff.discord_id = target.discord_id
  and staff.commission_tier = 'manager_95'
  and target.salary_rate is distinct from 95
  and target.status = 'completed'
  and target.wallet_settled_at is null
  and coalesce(target.is_deleted, false) = false;

update public.qiunai_salary_orders as target
set salary_rate = 95,
    staff_salary = round(coalesce(target.order_amount, 0) * 0.95),
    salary_level = case
      when coalesce(target.service_name, '') like '%打賞%'
        then '打賞特別設定 95%'
      else '主管指定 95%'
    end,
    platform_expense = round(coalesce(target.order_amount, 0) * 0.95)
      + coalesce(target.bonus_amount, 0)
from public.qiunai_staff as staff
where staff.discord_id = target.discord_id
  and staff.commission_tier = 'manager_95'
  and target.salary_rate is distinct from 95
  and target.status = '未發薪'
  and target.wallet_settled_at is null
  and coalesce(target.is_deleted, false) = false;

notify pgrst, 'reload schema';
