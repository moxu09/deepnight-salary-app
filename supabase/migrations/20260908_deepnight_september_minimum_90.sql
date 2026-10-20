-- 深夜不關燈：2026 年 9 月最低抽成 90%，高於 90% 的個人檔位不受影響。
-- 2026-10-01 00:00（台北時間）後自動回到原本個人抽成規則。
update public.salary_activity_commission_settings
set activity_rate = 90,
    starts_at = '2026-09-01 00:00:00+08',
    ends_at = '2026-10-01 00:00:00+08',
    force_rate = false,
    updated_at = now()
where app_key = 'deepnight';

update public.play_orders as target
set salary_rate = 90,
    staff_salary = round(coalesce(target.order_amount, target.price, 0) * 0.90),
    salary_level = '九月活動最低 90%',
    platform_expense = round(coalesce(target.order_amount, target.price, 0) * 0.90)
      + coalesce(target.bonus_amount, 0)
where coalesce(target.is_deleted, false) = false
  and target.wallet_settled_at is null
  and target.discord_id is not null
  and coalesce(target.staff_salary, 0) <> 0
  and coalesce(target.salary_rate, 0) <= 90
  and coalesce(
    target.order_finished_at::timestamptz,
    target.completed_at::timestamptz,
    target.created_at::timestamptz
  ) >= '2026-09-01 00:00:00+08'
  and coalesce(
    target.order_finished_at::timestamptz,
    target.completed_at::timestamptz,
    target.created_at::timestamptz
  ) < '2026-10-01 00:00:00+08';
