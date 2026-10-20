begin;
create or replace function public.protect_deepnight_activity_history()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if exists(select 1 from public.deepnight_activity_responses where activity_id = old.id) then
    raise exception '活動已有員工回覆，請改為停止發布以保留紀錄';
  end if;
  return old;
end;
$$;
create or replace function public.protect_deepnight_activity_option()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if exists(select 1 from public.deepnight_activity_responses where selected_option_id = old.id) then
    raise exception '已有員工選擇的活動選項不能刪除';
  end if;
  return old;
end;
$$;
drop trigger if exists deepnight_activity_history_guard on public.deepnight_activities;
create trigger deepnight_activity_history_guard before delete on public.deepnight_activities
for each row execute function public.protect_deepnight_activity_history();
drop trigger if exists deepnight_activity_option_guard on public.deepnight_activity_options;
create trigger deepnight_activity_option_guard before delete on public.deepnight_activity_options
for each row execute function public.protect_deepnight_activity_option();
revoke all on function public.protect_deepnight_activity_history() from public, anon, authenticated;
revoke all on function public.protect_deepnight_activity_option() from public, anon, authenticated;
commit;
