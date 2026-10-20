-- 原始訂單負責付款與訂單狀態；陪陪薪資只能由 WORK 工時單產生。
create or replace function public.prevent_play_order_source_salary_duplicate()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
begin
  if coalesce(new.order_id, new.order_no, '') like 'WORK-%' then
    return new;
  end if;

  if exists (
    select 1
    from public.play_orders as work_order
    where coalesce(work_order.is_deleted, false) = false
      and coalesce(work_order.order_id, work_order.order_no, '')
        like 'WORK-' || new.id::text || '-%'
  ) then
    new.discord_id := null;
    new.staff_name := null;
    new.staff_salary := 0;
    new.bonus_amount := 0;
    new.salary_rate := null;
    new.salary_level := null;
    new.platform_expense := 0;
  end if;

  return new;
end;
$function$;

drop trigger if exists prevent_play_order_source_salary_duplicate_trigger
  on public.play_orders;
create trigger prevent_play_order_source_salary_duplicate_trigger
before insert or update on public.play_orders
for each row execute function public.prevent_play_order_source_salary_duplicate();

create or replace function public.clear_play_order_source_salary_after_work_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_source_id uuid;
begin
  if coalesce(new.is_deleted, false) = true then
    return new;
  end if;

  begin
    v_source_id := substring(
      coalesce(new.order_id, new.order_no, '')
      from '^WORK-([0-9a-fA-F-]{36})-[0-9]+$'
    )::uuid;
  exception when others then
    return new;
  end;

  if v_source_id is null then
    return new;
  end if;

  update public.play_orders
  set discord_id = null,
      staff_name = null,
      staff_salary = 0,
      bonus_amount = 0,
      salary_rate = null,
      salary_level = null,
      platform_expense = 0
  where id = v_source_id
    and coalesce(order_id, order_no, '') not like 'WORK-%';

  return new;
end;
$function$;

drop trigger if exists clear_play_order_source_salary_after_work_report_trigger
  on public.play_orders;
create trigger clear_play_order_source_salary_after_work_report_trigger
after insert or update of is_deleted, order_id, order_no on public.play_orders
for each row execute function public.clear_play_order_source_salary_after_work_report();
