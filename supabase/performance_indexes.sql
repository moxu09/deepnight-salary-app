-- Read-only performance indexes for DeepNight salary and rainbot queries.
-- Safe to run repeatedly in the Supabase SQL Editor.

create index if not exists idx_play_orders_guild_created
  on public.play_orders (guild_id, created_at desc);
create index if not exists idx_play_orders_channel_created
  on public.play_orders (channel_id, created_at desc);
create index if not exists idx_play_orders_status_accepted
  on public.play_orders (status, accepted_at desc);
create index if not exists idx_play_orders_customer_created
  on public.play_orders (customer_id, created_at desc);
create index if not exists idx_players_discord
  on public.players (discord_id);
create index if not exists idx_players_status
  on public.players (status);
create index if not exists idx_players_bonus_staff_created
  on public.players_bonus (discord_id, created_at desc);
create index if not exists idx_players_services_staff
  on public.players_services (discord_id);
create index if not exists idx_salary_wallet_entries_app_staff_created
  on public.salary_wallet_entries (app_key, discord_id, created_at desc);
create index if not exists idx_salary_withdraw_app_staff_requested
  on public.salary_withdraw_requests (app_key, discord_id, requested_at desc);
create index if not exists idx_accounting_ledger_app_occurred
  on public.accounting_ledger (app_key, occurred_at desc);
