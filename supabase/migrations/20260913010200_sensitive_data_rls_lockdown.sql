-- Shared Supabase hardening for the DeepNight and Qiunai EIP applications.
-- Browser clients use the anon key, but a signed-in request is sent to
-- PostgREST as `authenticated`. Anonymous visitors receive no table grants.
-- Server routes continue to use service_role and therefore keep their access.

begin;

create or replace function public.erp_current_discord_id()
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select candidates.discord_id
  from auth.identities identity_row
  cross join lateral unnest(array[
    nullif(identity_row.identity_data ->> 'provider_id', ''),
    nullif(identity_row.identity_data ->> 'sub', ''),
    nullif(identity_row.identity_data ->> 'user_id', ''),
    nullif(identity_row.id::text, '')
  ]) with ordinality as candidates(discord_id, priority)
  where identity_row.user_id = auth.uid()
    and identity_row.provider = 'discord'
    and candidates.discord_id ~ '^[0-9]{15,22}$'
  order by candidates.priority
  limit 1;
$function$;

create or replace function public.erp_has_salary_access(p_organization text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_discord_id text := public.erp_current_discord_id();
begin
  if v_discord_id is null then
    return false;
  end if;

  if v_discord_id = '847840193859682304' then
    return true;
  end if;

  if exists (
    select 1
    from public.erp_role_assignments assignment
    where assignment.organization_code = p_organization
      and assignment.discord_id = v_discord_id
      and assignment.is_active = true
      and assignment.role in ('super_admin', 'store_manager', 'customer_service')
  ) then
    return true;
  end if;

  if p_organization = 'deepnight' then
    return exists (
      select 1 from public.admins admin_row
      where admin_row.discord_id = v_discord_id
        and coalesce(admin_row.is_active, true) = true
        and not exists (
          select 1 from public.erp_role_assignments assignment
          where assignment.organization_code = p_organization
            and assignment.discord_id = v_discord_id
        )
    );
  end if;

  if p_organization = 'qiunai' then
    return exists (
      select 1 from public.qiunai_admins admin_row
      where admin_row.discord_id = v_discord_id
        and coalesce(admin_row.is_active, true) = true
        and not exists (
          select 1 from public.erp_role_assignments assignment
          where assignment.organization_code = p_organization
            and assignment.discord_id = v_discord_id
        )
    );
  end if;

  return false;
end;
$function$;

create or replace function public.erp_is_manager(p_organization text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_discord_id text := public.erp_current_discord_id();
begin
  if v_discord_id is null then
    return false;
  end if;

  if v_discord_id = '847840193859682304' then
    return true;
  end if;

  if exists (
    select 1
    from public.erp_role_assignments assignment
    where assignment.organization_code = p_organization
      and assignment.discord_id = v_discord_id
      and assignment.is_active = true
      and assignment.role in ('super_admin', 'store_manager')
  ) then
    return true;
  end if;

  -- Legacy administrators predate erp_role_assignments and are treated as
  -- managers until the role migration has populated their assignment.
  if p_organization = 'deepnight' then
    return exists (
      select 1 from public.admins admin_row
      where admin_row.discord_id = v_discord_id
        and coalesce(admin_row.is_active, true) = true
        and not exists (
          select 1 from public.erp_role_assignments assignment
          where assignment.organization_code = p_organization
            and assignment.discord_id = v_discord_id
        )
    );
  end if;

  if p_organization = 'qiunai' then
    return exists (
      select 1 from public.qiunai_admins admin_row
      where admin_row.discord_id = v_discord_id
        and coalesce(admin_row.is_active, true) = true
        and not exists (
          select 1 from public.erp_role_assignments assignment
          where assignment.organization_code = p_organization
            and assignment.discord_id = v_discord_id
        )
    );
  end if;

  return false;
end;
$function$;

revoke all on function public.erp_current_discord_id()
  from public, anon;
revoke all on function public.erp_has_salary_access(text)
  from public, anon;
revoke all on function public.erp_is_manager(text)
  from public, anon;
grant execute on function public.erp_current_discord_id()
  to authenticated, service_role;
grant execute on function public.erp_has_salary_access(text)
  to authenticated, service_role;
grant execute on function public.erp_is_manager(text)
  to authenticated, service_role;

-- A source row may only enter a salary-settled state after its immutable
-- wallet components exist and add up to the amount recorded on the source.
-- This blocks bypassing the EIP UI with a direct PostgREST status update.
create or replace function public.enforce_salary_order_settlement_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_app_key text := tg_argv[0];
  v_source_table text := tg_argv[1];
  v_guild_id text := nullif(tg_argv[2], '');
  v_old_in_scope boolean := false;
  v_new_in_scope boolean := false;
  v_was_settled boolean := false;
  v_expected numeric := round(
    coalesce(new.staff_salary, 0)::numeric
      + coalesce(new.bonus_amount, 0)::numeric,
    2
  );
  v_ledger_total numeric;
begin
  -- play_orders is shared by several Discord stores. Only enforce DeepNight's
  -- ledger rules for its guild and for legacy NULL-guild rows that belong to
  -- a known DeepNight player; other brands keep their own settlement flow.
  if v_source_table = 'play_orders' then
    v_new_in_scope := new.guild_id = v_guild_id
      or (
        new.guild_id is null
        and exists (
          select 1
            from public.players player_row
           where player_row.discord_id = new.discord_id
        )
      );

    if tg_op = 'UPDATE' then
      v_old_in_scope := old.guild_id = v_guild_id
        or (
          old.guild_id is null
          and exists (
            select 1
              from public.players player_row
             where player_row.discord_id = old.discord_id
          )
        );
      if not v_old_in_scope and not v_new_in_scope then
        return new;
      end if;
    elsif not v_new_in_scope then
      return new;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    select exists (
      select 1
        from public.salary_wallet_entries entry
       where entry.app_key = v_app_key
         and (
           (
             entry.source_table = v_source_table
             and entry.source_id = old.id::text
             and entry.entry_type in ('order_salary', 'order_bonus')
           )
           or (
             entry.source_table = v_app_key || '_salary_order_corrections'
             and entry.entry_type = 'salary_correction'
             and entry.metadata ->> 'target_order_id' = old.id::text
           )
         )
    ) into v_was_settled;

    if (
      coalesce(old.status, '') in ('已入帳', '已發薪')
      or old.wallet_settled_at is not null
      or v_was_settled
    ) then
      if v_source_table = 'play_orders'
         and new.guild_id is distinct from old.guild_id then
        raise exception '已結算薪資不可變更所屬伺服器';
      end if;

      if new.discord_id is distinct from old.discord_id
         or new.staff_name is distinct from old.staff_name
         or new.is_deleted is distinct from old.is_deleted
         or new.wallet_settled_at is distinct from old.wallet_settled_at
         or new.wallet_period_key is distinct from old.wallet_period_key
         or new.paid_at is distinct from old.paid_at
         or coalesce(new.status, '') not in ('已入帳', '已發薪')
         or (
           old.status = '已發薪'
           and new.status is distinct from '已發薪'
         ) then
        raise exception
          '已結算薪資不可改員工、刪除狀態、結算欄位或回退狀態';
      end if;

      -- The Qiunai correction RPC is service-role-only and may change money
      -- fields because it appends the balancing immutable ledger row in this
      -- same transaction. Identity and settlement fields above never bypass.
      if not (
        v_app_key = 'qiunai'
        and nullif(
          current_setting('erp.salary_correction_operation', true), ''
        ) is not null
      ) and (
        new.order_amount is distinct from old.order_amount
        or new.salary_rate is distinct from old.salary_rate
        or new.staff_salary is distinct from old.staff_salary
        or new.bonus_amount is distinct from old.bonus_amount
      ) then
        raise exception
          '已結算薪資不可直接改金額，請使用原子補差程序';
      end if;
    end if;
  end if;

  if v_app_key = 'qiunai'
     and nullif(
       current_setting('erp.salary_correction_operation', true), ''
     ) is not null then
    return new;
  end if;

  if coalesce(new.status, '') not in ('已入帳', '已發薪')
     and new.wallet_settled_at is null then
    return new;
  end if;

  select coalesce(round(sum(entry.amount)::numeric, 2), 0)
    into v_ledger_total
    from public.salary_wallet_entries entry
   where entry.app_key = v_app_key
     and (
       (
         entry.source_table = v_source_table
         and entry.source_id = new.id::text
         and entry.entry_type in ('order_salary', 'order_bonus')
       )
       or (
         entry.source_table = v_app_key || '_salary_order_corrections'
         and entry.entry_type = 'salary_correction'
         and entry.metadata ->> 'target_order_id' = new.id::text
       )
     );

  if v_ledger_total <> v_expected then
    raise exception
      '不能只標記薪資已入帳：錢包明細合計 %，來源應入帳 %',
      v_ledger_total, v_expected;
  end if;

  return new;
end;
$function$;

create or replace function public.enforce_salary_bonus_settlement_ledger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_app_key text := tg_argv[0];
  v_source_table text := tg_argv[1];
  v_expected numeric := round(coalesce(new.amount, 0)::numeric, 2);
  v_ledger_total numeric;
  v_was_settled boolean := false;
begin
  if tg_op = 'UPDATE' then
    select exists (
      select 1
        from public.salary_wallet_entries entry
       where entry.app_key = v_app_key
         and entry.source_table = v_source_table
         and entry.source_id = old.id::text
         and entry.entry_type = 'staff_bonus'
    ) into v_was_settled;

    if (old.wallet_settled_at is not null or v_was_settled)
       and (
       new.discord_id is distinct from old.discord_id
       or new.staff_name is distinct from old.staff_name
       or new.amount is distinct from old.amount
       or new.wallet_settled_at is distinct from old.wallet_settled_at
       or new.wallet_period_key is distinct from old.wallet_period_key
       ) then
      raise exception
        '已結算獎金或扣薪不可改員工、金額或結算欄位';
    end if;
  end if;

  if new.wallet_settled_at is null then
    return new;
  end if;

  select coalesce(round(sum(entry.amount)::numeric, 2), 0)
    into v_ledger_total
    from public.salary_wallet_entries entry
   where entry.app_key = v_app_key
     and entry.source_table = v_source_table
     and entry.source_id = new.id::text
     and entry.entry_type = 'staff_bonus';

  if v_ledger_total <> v_expected then
    raise exception
      '不能只標記獎金或扣薪已入帳：錢包明細合計 %，來源應入帳 %',
      v_ledger_total, v_expected;
  end if;

  return new;
end;
$function$;

create or replace function public.prevent_settled_salary_order_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_app_key text := tg_argv[0];
  v_source_table text := tg_argv[1];
  v_guild_id text := nullif(tg_argv[2], '');
begin
  if v_source_table = 'play_orders' then
    if old.guild_id is distinct from v_guild_id
       and (
         old.guild_id is not null
         or not exists (
           select 1
             from public.players player_row
            where player_row.discord_id = old.discord_id
         )
       ) then
      return old;
    end if;
  end if;

  if coalesce(old.status, '') in ('已入帳', '已發薪')
     or old.wallet_settled_at is not null
     or exists (
       select 1
         from public.salary_wallet_entries entry
        where entry.app_key = v_app_key
          and (
            (
              entry.source_table = v_source_table
              and entry.source_id = old.id::text
              and entry.entry_type in ('order_salary', 'order_bonus')
            )
            or (
              entry.entry_type = 'salary_correction'
              and entry.source_table = v_app_key || '_salary_order_corrections'
              and entry.metadata ->> 'target_order_id' = old.id::text
            )
          )
     ) then
    raise exception '已結算薪資來源不可刪除';
  end if;

  return old;
end;
$function$;

create or replace function public.prevent_settled_salary_bonus_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_app_key text := tg_argv[0];
  v_source_table text := tg_argv[1];
begin
  if old.wallet_settled_at is not null
     or exists (
       select 1
         from public.salary_wallet_entries entry
        where entry.app_key = v_app_key
          and entry.source_table = v_source_table
          and entry.source_id = old.id::text
          and entry.entry_type = 'staff_bonus'
     ) then
    raise exception '已結算獎金或扣薪來源不可刪除';
  end if;

  return old;
end;
$function$;

revoke all on function public.enforce_salary_order_settlement_ledger()
  from public, anon, authenticated;
revoke all on function public.enforce_salary_bonus_settlement_ledger()
  from public, anon, authenticated;
revoke all on function public.prevent_settled_salary_order_delete()
  from public, anon, authenticated;
revoke all on function public.prevent_settled_salary_bonus_delete()
  from public, anon, authenticated;

drop trigger if exists deepnight_salary_order_requires_ledger
  on public.play_orders;
create trigger deepnight_salary_order_requires_ledger
before insert or update of status, guild_id, discord_id, staff_name, is_deleted,
  paid_at, wallet_settled_at, wallet_period_key, order_amount, salary_rate,
  staff_salary, bonus_amount
on public.play_orders
for each row execute function public.enforce_salary_order_settlement_ledger(
  'deepnight', 'play_orders', '1501098191813214312'
);

drop trigger if exists deepnight_settled_salary_order_no_delete
  on public.play_orders;
create trigger deepnight_settled_salary_order_no_delete
before delete on public.play_orders
for each row execute function public.prevent_settled_salary_order_delete(
  'deepnight', 'play_orders', '1501098191813214312'
);

drop trigger if exists qiunai_salary_order_requires_ledger
  on public.qiunai_salary_orders;
create trigger qiunai_salary_order_requires_ledger
before insert or update of status, discord_id, staff_name, is_deleted, paid_at,
  wallet_settled_at, wallet_period_key, order_amount, salary_rate, staff_salary,
  bonus_amount
on public.qiunai_salary_orders
for each row execute function public.enforce_salary_order_settlement_ledger(
  'qiunai', 'qiunai_salary_orders'
);

drop trigger if exists qiunai_settled_salary_order_no_delete
  on public.qiunai_salary_orders;
create trigger qiunai_settled_salary_order_no_delete
before delete on public.qiunai_salary_orders
for each row execute function public.prevent_settled_salary_order_delete(
  'qiunai', 'qiunai_salary_orders'
);

drop trigger if exists deepnight_salary_bonus_requires_ledger
  on public.players_bonus;
create trigger deepnight_salary_bonus_requires_ledger
before insert or update of discord_id, staff_name, wallet_settled_at,
  wallet_period_key, amount
on public.players_bonus
for each row execute function public.enforce_salary_bonus_settlement_ledger(
  'deepnight', 'players_bonus'
);

drop trigger if exists deepnight_settled_salary_bonus_no_delete
  on public.players_bonus;
create trigger deepnight_settled_salary_bonus_no_delete
before delete on public.players_bonus
for each row execute function public.prevent_settled_salary_bonus_delete(
  'deepnight', 'players_bonus'
);

drop trigger if exists qiunai_salary_bonus_requires_ledger
  on public.qiunai_staff_bonus;
create trigger qiunai_salary_bonus_requires_ledger
before insert or update of discord_id, staff_name, wallet_settled_at,
  wallet_period_key, amount
on public.qiunai_staff_bonus
for each row execute function public.enforce_salary_bonus_settlement_ledger(
  'qiunai', 'qiunai_staff_bonus'
);

drop trigger if exists qiunai_settled_salary_bonus_no_delete
  on public.qiunai_staff_bonus;
create trigger qiunai_settled_salary_bonus_no_delete
before delete on public.qiunai_staff_bonus
for each row execute function public.prevent_settled_salary_bonus_delete(
  'qiunai', 'qiunai_staff_bonus'
);

-- Drop pre-existing policies on the browser-accessed EIP tables. PostgreSQL
-- combines permissive policies with OR, so leaving an old `true` policy would
-- make a new restrictive-looking policy ineffective.
do $drop_browser_policies$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = any (array[
        'players',
        'players_services',
        'play_orders',
        'players_bonus',
        'admins',
        'salary_settings',
        'qiunai_staff',
        'qiunai_staff_services',
        'qiunai_salary_orders',
        'qiunai_staff_bonus',
        'qiunai_admins',
        'qiunai_salary_settings',
        'salary_wallet_entries',
        'users',
        'wallet_logs',
        'user_items'
      ])
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end;
$drop_browser_policies$;

alter table public.players enable row level security;
alter table public.players_services enable row level security;
alter table public.play_orders enable row level security;
alter table public.players_bonus enable row level security;
alter table public.admins enable row level security;
alter table public.salary_settings enable row level security;
alter table public.qiunai_staff enable row level security;
alter table public.qiunai_staff_services enable row level security;
alter table public.qiunai_salary_orders enable row level security;
alter table public.qiunai_staff_bonus enable row level security;
alter table public.qiunai_admins enable row level security;
alter table public.qiunai_salary_settings enable row level security;
alter table public.salary_wallet_entries enable row level security;
alter table public.users enable row level security;
alter table public.wallet_logs enable row level security;
alter table public.user_items enable row level security;

revoke all on table
  public.players,
  public.players_services,
  public.play_orders,
  public.players_bonus,
  public.admins,
  public.salary_settings,
  public.qiunai_staff,
  public.qiunai_staff_services,
  public.qiunai_salary_orders,
  public.qiunai_staff_bonus,
  public.qiunai_admins,
  public.qiunai_salary_settings,
  public.salary_wallet_entries,
  public.users,
  public.wallet_logs,
  public.user_items
from public, anon, authenticated;

grant select, insert, update on table
  public.players,
  public.players_services,
  public.play_orders,
  public.players_bonus,
  public.qiunai_staff,
  public.qiunai_staff_services,
  public.qiunai_salary_orders,
  public.qiunai_staff_bonus
to authenticated;
grant delete on table
  public.players,
  public.players_services,
  public.qiunai_staff,
  public.qiunai_staff_services
to authenticated;
grant select on table public.admins, public.qiunai_admins to authenticated;
grant select, insert, update on table
  public.salary_settings,
  public.qiunai_salary_settings
to authenticated;
grant select on table public.salary_wallet_entries to authenticated;
grant select on table public.users, public.wallet_logs, public.user_items
  to authenticated;
grant all on table
  public.players,
  public.players_services,
  public.play_orders,
  public.players_bonus,
  public.admins,
  public.salary_settings,
  public.qiunai_staff,
  public.qiunai_staff_services,
  public.qiunai_salary_orders,
  public.qiunai_staff_bonus,
  public.qiunai_admins,
  public.qiunai_salary_settings,
  public.salary_wallet_entries,
  public.users,
  public.wallet_logs,
  public.user_items
to service_role;

-- DeepNight employee profile and service preferences.
create policy deepnight_players_select on public.players
  for select to authenticated
  using (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('deepnight')
  );
create policy deepnight_players_update on public.players
  for update to authenticated
  using (public.erp_is_manager('deepnight'))
  with check (public.erp_is_manager('deepnight'));
create policy deepnight_players_insert on public.players
  for insert to authenticated
  with check (public.erp_is_manager('deepnight'));
create policy deepnight_players_delete on public.players
  for delete to authenticated
  using (public.erp_is_manager('deepnight'));

create policy deepnight_services_select on public.players_services
  for select to authenticated
  using (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('deepnight')
  );
create policy deepnight_services_insert on public.players_services
  for insert to authenticated
  with check (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('deepnight')
  );
create policy deepnight_services_update on public.players_services
  for update to authenticated
  using (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('deepnight')
  )
  with check (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('deepnight')
  );
create policy deepnight_services_delete on public.players_services
  for delete to authenticated
  using (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('deepnight')
  );

create policy deepnight_orders_select on public.play_orders
  for select to authenticated
  using (
    (
      guild_id = '1501098191813214312'
      and (
        discord_id = public.erp_current_discord_id()
        or public.erp_has_salary_access('deepnight')
      )
    )
    or (
      guild_id is null
      and (
        discord_id = public.erp_current_discord_id()
        or (
          public.erp_is_manager('deepnight')
          and exists (
            select 1 from public.players deepnight_player
            where deepnight_player.discord_id = play_orders.discord_id
          )
        )
      )
    )
  );
create policy deepnight_orders_insert on public.play_orders
  for insert to authenticated
  with check (
    public.erp_is_manager('deepnight')
    and (
      guild_id = '1501098191813214312'
      or (
        guild_id is null
        and exists (
          select 1 from public.players deepnight_player
          where deepnight_player.discord_id = play_orders.discord_id
        )
      )
    )
  );
create policy deepnight_orders_update on public.play_orders
  for update to authenticated
  using (
    public.erp_is_manager('deepnight')
    and (
      guild_id = '1501098191813214312'
      or (
        guild_id is null
        and exists (
          select 1 from public.players deepnight_player
          where deepnight_player.discord_id = play_orders.discord_id
        )
      )
    )
  )
  with check (
    public.erp_is_manager('deepnight')
    and (
      guild_id = '1501098191813214312'
      or (
        guild_id is null
        and exists (
          select 1 from public.players deepnight_player
          where deepnight_player.discord_id = play_orders.discord_id
        )
      )
    )
  );

create policy deepnight_bonus_select on public.players_bonus
  for select to authenticated
  using (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('deepnight')
  );
create policy deepnight_bonus_insert on public.players_bonus
  for insert to authenticated
  with check (public.erp_is_manager('deepnight'));
create policy deepnight_bonus_update on public.players_bonus
  for update to authenticated
  using (public.erp_is_manager('deepnight'))
  with check (public.erp_is_manager('deepnight'));

create policy deepnight_admin_self_select on public.admins
  for select to authenticated
  using (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('deepnight')
  );
create policy deepnight_salary_settings_select on public.salary_settings
  for select to authenticated
  using (public.erp_has_salary_access('deepnight'));
create policy deepnight_salary_settings_insert on public.salary_settings
  for insert to authenticated
  with check (public.erp_is_manager('deepnight'));
create policy deepnight_salary_settings_update on public.salary_settings
  for update to authenticated
  using (public.erp_is_manager('deepnight'))
  with check (public.erp_is_manager('deepnight'));

-- Qiunai employee profile and service preferences.
create policy qiunai_staff_select on public.qiunai_staff
  for select to authenticated
  using (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('qiunai')
  );
create policy qiunai_staff_update on public.qiunai_staff
  for update to authenticated
  using (public.erp_is_manager('qiunai'))
  with check (public.erp_is_manager('qiunai'));
create policy qiunai_staff_insert on public.qiunai_staff
  for insert to authenticated
  with check (public.erp_is_manager('qiunai'));
create policy qiunai_staff_delete on public.qiunai_staff
  for delete to authenticated
  using (public.erp_is_manager('qiunai'));

create policy qiunai_services_select on public.qiunai_staff_services
  for select to authenticated
  using (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('qiunai')
  );
create policy qiunai_services_insert on public.qiunai_staff_services
  for insert to authenticated
  with check (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('qiunai')
  );
create policy qiunai_services_update on public.qiunai_staff_services
  for update to authenticated
  using (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('qiunai')
  )
  with check (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('qiunai')
  );
create policy qiunai_services_delete on public.qiunai_staff_services
  for delete to authenticated
  using (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('qiunai')
  );

create policy qiunai_orders_select on public.qiunai_salary_orders
  for select to authenticated
  using (
    discord_id = public.erp_current_discord_id()
    or public.erp_has_salary_access('qiunai')
  );
create policy qiunai_orders_insert on public.qiunai_salary_orders
  for insert to authenticated
  with check (public.erp_is_manager('qiunai'));
create policy qiunai_orders_update on public.qiunai_salary_orders
  for update to authenticated
  using (public.erp_is_manager('qiunai'))
  with check (public.erp_is_manager('qiunai'));

create policy qiunai_bonus_select on public.qiunai_staff_bonus
  for select to authenticated
  using (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('qiunai')
  );
create policy qiunai_bonus_insert on public.qiunai_staff_bonus
  for insert to authenticated
  with check (public.erp_is_manager('qiunai'));
create policy qiunai_bonus_update on public.qiunai_staff_bonus
  for update to authenticated
  using (public.erp_is_manager('qiunai'))
  with check (public.erp_is_manager('qiunai'));

create policy qiunai_admin_self_select on public.qiunai_admins
  for select to authenticated
  using (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager('qiunai')
  );
create policy qiunai_salary_settings_select on public.qiunai_salary_settings
  for select to authenticated
  using (public.erp_has_salary_access('qiunai'));
create policy qiunai_salary_settings_insert on public.qiunai_salary_settings
  for insert to authenticated
  with check (public.erp_is_manager('qiunai'));
create policy qiunai_salary_settings_update on public.qiunai_salary_settings
  for update to authenticated
  using (public.erp_is_manager('qiunai'))
  with check (public.erp_is_manager('qiunai'));

-- Shared wallet rows remain visible only to the matching employee or a
-- salary-authorized role in the same organization.
create policy salary_wallet_entries_select on public.salary_wallet_entries
  for select to authenticated
  using (
    discord_id = public.erp_current_discord_id()
    or public.erp_is_manager(app_key)
  );

-- ASD/customer-wallet tables are shared by the bots. Browser access is
-- read-only and limited to the signed-in Discord identity (or an EIP manager);
-- every balance or inventory mutation remains server-only.
create policy users_own_select on public.users
  for select to authenticated
  using (
    user_id = public.erp_current_discord_id()
    or (
      public.erp_is_manager('deepnight')
      and exists (
        select 1 from public.players deepnight_player
        where deepnight_player.discord_id = users.user_id
      )
    )
    or (
      public.erp_is_manager('qiunai')
      and exists (
        select 1 from public.qiunai_staff qiunai_employee
        where qiunai_employee.discord_id = users.user_id
      )
    )
  );
create policy wallet_logs_own_select on public.wallet_logs
  for select to authenticated
  using (
    user_id = public.erp_current_discord_id()
    or (
      public.erp_is_manager('deepnight')
      and exists (
        select 1 from public.players deepnight_player
        where deepnight_player.discord_id = wallet_logs.user_id
      )
    )
    or (
      public.erp_is_manager('qiunai')
      and exists (
        select 1 from public.qiunai_staff qiunai_employee
        where qiunai_employee.discord_id = wallet_logs.user_id
      )
    )
  );
create policy user_items_own_select on public.user_items
  for select to authenticated
  using (
    user_id = public.erp_current_discord_id()
    or (
      public.erp_is_manager('deepnight')
      and exists (
        select 1 from public.players deepnight_player
        where deepnight_player.discord_id = user_items.user_id
      )
    )
    or (
      public.erp_is_manager('qiunai')
      and exists (
        select 1 from public.qiunai_staff qiunai_employee
        where qiunai_employee.discord_id = user_items.user_id
      )
    )
  );

-- These tables are only accessed through authenticated server routes in both
-- EIP apps. Optional tables are handled dynamically so the migration is safe
-- while rolling the two applications forward against their shared database.
do $lock_server_only_tables$
declare
  table_name text;
begin
  foreach table_name in array array[
    'salary_withdraw_requests',
    'accounting_ledger',
    'erp_activity_logs',
    'salary_requests',
    'salary_announcements',
    'salary_announcement_signatures',
    'employment_contract_signings',
    'device_audit_reports',
    'device_audit_upload_tokens',
    'device_audit_role_memberships',
    'customer_service_order_points',
    'salary_public_profiles',
    'salary_wallet_correction_operations',
    'erp_role_assignments',
    'monthly_accounts',
    'monthly_account_transactions',
    'member_monthly_accounts',
    'member_monthly_bills',
    'member_monthly_transactions',
    'jkopay_topups',
    'jkopay_topup_orders',
    'jkopay_service_payments',
    'alliance_members',
    'transfers',
    'bot_service_order_flows',
    'order_extensions',
    'order_reviews',
    'merchandise_orders',
    'salary_orders',
    'member_guarantee_logs',
    'raffle_spending',
    'red_packet_claims',
    'used_coupons',
    'user_benefits',
    'user_vips',
    'monthly_vips',
    'vip_monthly_keep_logs',
    'vip_upgrade_logs'
  ]
  loop
    if to_regclass('public.' || table_name) is not null then
      execute format(
        'alter table public.%I enable row level security', table_name
      );
      execute format(
        'revoke all on table public.%I from public, anon, authenticated',
        table_name
      );
      execute format(
        'grant all on table public.%I to service_role', table_name
      );
    end if;
  end loop;
end;
$lock_server_only_tables$;

comment on function public.erp_current_discord_id() is
  'Returns the signed-in user Discord ID from provider-controlled auth.identities data.';
comment on function public.erp_has_salary_access(text) is
  'Checks whether the current authenticated Discord identity may access organization salary records.';

-- Fail the migration if any existing target still grants raw SELECT to anon
-- or if service_role lost access. This checks privileges without reading data.
do $verify_lockdown$
declare
  table_name text;
  failed_anon text[] := array[]::text[];
  failed_service text[] := array[]::text[];
begin
  foreach table_name in array array[
    'players', 'players_services', 'play_orders', 'players_bonus', 'admins',
    'salary_settings', 'qiunai_staff', 'qiunai_staff_services',
    'qiunai_salary_orders', 'qiunai_staff_bonus', 'qiunai_admins',
    'qiunai_salary_settings', 'salary_wallet_entries', 'users',
    'wallet_logs', 'user_items', 'salary_withdraw_requests',
    'accounting_ledger', 'erp_activity_logs', 'salary_requests',
    'salary_announcements', 'salary_announcement_signatures',
    'employment_contract_signings', 'device_audit_reports',
    'device_audit_upload_tokens', 'device_audit_role_memberships',
    'customer_service_order_points', 'salary_public_profiles',
    'salary_wallet_correction_operations', 'erp_role_assignments',
    'monthly_accounts', 'monthly_account_transactions',
    'member_monthly_accounts', 'member_monthly_bills',
    'member_monthly_transactions', 'jkopay_topups',
    'jkopay_topup_orders', 'jkopay_service_payments', 'alliance_members',
    'transfers', 'bot_service_order_flows', 'order_extensions',
    'order_reviews', 'merchandise_orders', 'salary_orders',
    'member_guarantee_logs', 'raffle_spending', 'red_packet_claims',
    'used_coupons', 'user_benefits', 'user_vips', 'monthly_vips',
    'vip_monthly_keep_logs', 'vip_upgrade_logs'
  ]
  loop
    if to_regclass('public.' || table_name) is null then
      continue;
    end if;
    if has_table_privilege(
      'anon', to_regclass('public.' || table_name), 'select'
    ) then
      failed_anon := array_append(failed_anon, table_name);
    end if;
    if not has_table_privilege(
      'service_role', to_regclass('public.' || table_name), 'select'
    ) then
      failed_service := array_append(failed_service, table_name);
    end if;
  end loop;

  if cardinality(failed_anon) > 0 then
    raise exception 'RLS lockdown failed; anon still has SELECT on: %',
      array_to_string(failed_anon, ', ');
  end if;
  if cardinality(failed_service) > 0 then
    raise exception 'RLS lockdown broke service_role SELECT on: %',
      array_to_string(failed_service, ', ');
  end if;
end;
$verify_lockdown$;

commit;
