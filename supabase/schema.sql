create extension if not exists pgcrypto;

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  phone text unique not null,
  name text,
  company text,
  city text,
  tags text[] not null default '{}',
  custom_fields jsonb not null default '{}'::jsonb,
  opt_in boolean not null default false,
  opt_in_source text,
  opt_in_at timestamptz,
  opted_out_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  template_name text not null,
  language_code text not null default 'en',
  header_media_id text,
  header_type text,
  body_variable_fields text[] not null default '{}',
  status text not null default 'processing',
  total_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.campaigns(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  phone text not null,
  meta_message_id text unique,
  template_name text,
  status text not null default 'queued',
  error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_contacts_opt_in on public.contacts(opt_in);
create index if not exists idx_contacts_phone on public.contacts(phone);
create index if not exists idx_message_logs_campaign on public.message_logs(campaign_id);
create index if not exists idx_message_logs_meta_id on public.message_logs(meta_message_id);

-- Inbound replies from leads (e.g. INTERESTED, STOP), captured by the webhook.
create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  meta_message_id text unique,
  phone text not null,
  profile_name text,
  type text,
  text text,
  context_message_id text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_inbound_messages_phone on public.inbound_messages(phone);
create index if not exists idx_inbound_messages_received on public.inbound_messages(received_at desc);

alter table public.contacts enable row level security;
alter table public.campaigns enable row level security;
alter table public.message_logs enable row level security;
alter table public.inbound_messages enable row level security;

-- This starter uses only the server-side service role key, which bypasses RLS.
-- Do not expose SUPABASE_SERVICE_ROLE_KEY to the browser.
