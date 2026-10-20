-- 將深夜薪資訂單狀態由「發薪」統一改為「入帳」。
-- 已有錢包入帳時間或舊已發薪狀態的資料，均視為已入帳。
update public.play_orders
set
  status = '已入帳',
  paid_at = coalesce(wallet_settled_at, paid_at)
where wallet_settled_at is not null
   or status = '已發薪';

update public.play_orders
set status = '未入帳'
where wallet_settled_at is null
  and status = '未發薪';
