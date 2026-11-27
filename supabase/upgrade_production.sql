-- Run this once in Supabase SQL Editor if you already ran the original schema.sql.
-- Adds the table that stores replies from leads (INTERESTED, STOP, etc.).
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

alter table public.inbound_messages enable row level security;
