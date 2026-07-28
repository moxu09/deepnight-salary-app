create extension if not exists pgcrypto;

create table if not exists public.device_audit_upload_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_code text not null check (organization_code in ('deepnight', 'qiunai')),
  applicant_id text not null,
  token_hash text not null unique,
  created_by text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_report_id text,
  created_at timestamptz not null default now()
);

create index if not exists device_audit_upload_tokens_lookup_idx
  on public.device_audit_upload_tokens (token_hash, organization_code, expires_at);

create table if not exists public.device_audit_reports (
  id uuid primary key default gen_random_uuid(),
  organization_code text not null check (organization_code in ('deepnight', 'qiunai')),
  report_id text not null unique,
  applicant_id text not null,
  generated_at timestamptz not null,
  uploaded_at timestamptz not null default now(),
  device_fingerprint text,
  consent_accepted boolean not null default false,
  automatic_upload_accepted boolean not null default false,
  report_sha256 text not null,
  report_data jsonb not null,
  analysis jsonb not null,
  upload_token_id uuid references public.device_audit_upload_tokens(id),
  review_status text not null default 'pending'
    check (review_status in ('pending', 'reviewed', 'approved', 'rejected')),
  review_note text,
  reviewed_by text,
  reviewed_at timestamptz
);

create index if not exists device_audit_reports_org_uploaded_idx
  on public.device_audit_reports (organization_code, uploaded_at desc);

create index if not exists device_audit_reports_applicant_idx
  on public.device_audit_reports (organization_code, applicant_id, uploaded_at desc);

alter table public.device_audit_upload_tokens enable row level security;
alter table public.device_audit_reports enable row level security;

comment on table public.device_audit_reports is
  'Private Windows device audit reports. Access only through authenticated server routes.';

create table if not exists public.device_audit_role_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_code text not null check (organization_code in ('deepnight', 'qiunai')),
  discord_id text not null,
  display_name text,
  source_role_id text not null,
  is_active boolean not null default true,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_code, discord_id)
);

create index if not exists device_audit_role_memberships_access_idx
  on public.device_audit_role_memberships
  (organization_code, discord_id, is_active);

alter table public.device_audit_role_memberships enable row level security;
