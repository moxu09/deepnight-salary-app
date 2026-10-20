begin;

create or replace function public.submit_deepnight_activity_response(
  p_activity_id uuid, p_discord_id text, p_status text, p_option_id uuid, p_guests jsonb
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  activity public.deepnight_activities%rowtype;
  staff public.players%rowtype;
  response public.deepnight_activity_responses%rowtype;
  completed_orders integer;
begin
  select * into activity from public.deepnight_activities where id = p_activity_id for update;
  if not found or not activity.is_published then raise exception '找不到活動'; end if;
  if now() >= activity.response_deadline then raise exception '活動報名已截止'; end if;
  select * into staff from public.players where discord_id = p_discord_id and is_active is distinct from false;
  if not found then raise exception '找不到有效員工資料'; end if;
  if p_status not in ('attending', 'not_attending', 'distance') or p_status is null then raise exception '請選擇參與狀態'; end if;
  if p_status = 'not_attending' and not activity.allow_not_attending then raise exception '此活動已關閉不參與選項'; end if;
  if p_status = 'distance' and not activity.allow_distance then raise exception '此活動已關閉地區選項'; end if;
  select count(*) into completed_orders from public.play_orders
    where discord_id = p_discord_id and is_deleted is distinct from true
      and (completed_at is not null or salary_paid is true or status in ('已完成', '已入帳', 'completed'));
  if p_status = 'attending' and (completed_orders < activity.min_completed_orders
    or floor(extract(epoch from (now() - staff.created_at)) / 86400) < activity.min_employment_days)
    then raise exception '你目前不符合參與門檻'; end if;
  if jsonb_typeof(p_guests) is distinct from 'array' or jsonb_array_length(p_guests) > 1 then raise exception '每位員工最多攜帶一位親友'; end if;
  if p_status <> 'attending' then
    p_option_id := null;
    p_guests := '[]'::jsonb;
  elsif exists (select 1 from public.deepnight_activity_options where activity_id = p_activity_id) and p_option_id is null then
    raise exception '請選擇活動選項';
  end if;
  if p_option_id is not null and not exists(select 1 from public.deepnight_activity_options where id = p_option_id and activity_id = p_activity_id) then
    raise exception '活動選項不屬於此活動';
  end if;
  if exists(select 1 from jsonb_array_elements(p_guests) guest where char_length(trim(coalesce(guest->>'name', ''))) not between 1 and 100
    or char_length(trim(coalesce(guest->>'phone', ''))) not between 6 and 30) then raise exception '請完整填寫親友姓名與電話'; end if;
  insert into public.deepnight_activity_responses(activity_id, discord_id, response_status, selected_option_id, staff_nickname, staff_real_name, staff_phone)
    values(p_activity_id, p_discord_id, p_status, p_option_id, coalesce(staff.display_name, staff.discord_name, p_discord_id), staff.real_name, staff.phone)
    on conflict(activity_id, discord_id) do update set response_status = excluded.response_status, selected_option_id = excluded.selected_option_id,
      staff_nickname = excluded.staff_nickname, staff_real_name = excluded.staff_real_name, staff_phone = excluded.staff_phone, updated_at = now()
    returning * into response;
  delete from public.deepnight_activity_guests where response_id = response.id;
  insert into public.deepnight_activity_guests(response_id, slot, guest_name, guest_phone)
    select response.id, ordinality::smallint, trim(guest->>'name'), trim(guest->>'phone')
    from jsonb_array_elements(p_guests) with ordinality as guests(guest, ordinality);
  return to_jsonb(response);
end;
$$;
revoke all on function public.submit_deepnight_activity_response(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_deepnight_activity_response(uuid, text, text, uuid, jsonb) to service_role;

create or replace function public.replace_deepnight_poll_vote(p_announcement_id uuid, p_discord_id text, p_option_ids uuid[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare announcement public.salary_announcements%rowtype; option_count integer;
begin
  select * into announcement from public.salary_announcements where id = p_announcement_id and organization_code = 'deepnight' for update;
  if not found or not announcement.is_active or not announcement.is_poll then raise exception '這個投票目前無法作答'; end if;
  if not exists(select 1 from public.players where discord_id = p_discord_id and is_active is distinct from false) then raise exception '只有在職員工可以投票'; end if;
  if announcement.starts_at > now() or announcement.ends_at <= now() then raise exception '投票尚未開始或已截止'; end if;
  if cardinality(announcement.audience_discord_ids) > 0 and not (p_discord_id = any(announcement.audience_discord_ids)) then raise exception '你不在投票對象名單中'; end if;
  option_count := cardinality(p_option_ids);
  if option_count is null or option_count < 1 or option_count > 20 or array_position(p_option_ids, null) is not null then raise exception '請選擇有效投票選項'; end if;
  if not announcement.poll_allow_multiple and option_count <> 1 then raise exception '這個投票只能選一個選項'; end if;
  if (select count(*) from public.salary_poll_options where announcement_id = p_announcement_id and id = any(p_option_ids)) <> option_count then raise exception '投票選項不正確'; end if;
  delete from public.salary_poll_votes where announcement_id = p_announcement_id and discord_id = p_discord_id;
  insert into public.salary_poll_votes(announcement_id, option_id, discord_id)
    select p_announcement_id, unnest(p_option_ids), p_discord_id;
end;
$$;
revoke all on function public.replace_deepnight_poll_vote(uuid, text, uuid[]) from public, anon, authenticated;
grant execute on function public.replace_deepnight_poll_vote(uuid, text, uuid[]) to service_role;

notify pgrst, 'reload schema';
commit;
