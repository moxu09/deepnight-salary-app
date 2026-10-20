begin;
create table if not exists public.eip_app_installers (
  organization_code text not null check (organization_code in ('deepnight', 'qiunai')),
  platform text not null check(platform in ('macos-arm64','macos-x64','windows-x64','android')),
  version text not null,
  path text not null,
  filename text not null,
  size bigint not null check(size >= 1024 and size <= 52428800),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  published_by text not null,
  published_at timestamptz not null default now(),
  primary key(organization_code, platform),
  check (path like organization_code || '/installers/' || platform || '/%')
);
alter table public.eip_app_installers enable row level security;
revoke all on public.eip_app_installers from public, anon, authenticated;
grant all on public.eip_app_installers to service_role;
notify pgrst, 'reload schema';
commit;
