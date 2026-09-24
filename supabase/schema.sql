-- Chaster Messenger MVP tables (isolated from existing CRM `messages`)
-- Run this in Supabase Dashboard → SQL Editor → New query → Run

create table if not exists public.messenger_pages (
  id uuid primary key default gen_random_uuid(),
  page_id text not null unique,
  page_name text not null,
  page_access_token text not null,
  facebook_user_id text,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.messenger_messages (
  id uuid primary key default gen_random_uuid(),
  page_id text not null references public.messenger_pages (page_id) on delete cascade,
  sender_id text not null,
  recipient_id text not null,
  mid text unique,
  message_text text,
  direction text not null check (direction in ('incoming', 'outgoing')),
  reply_to_mid text,
  page_reaction text,
  customer_reaction text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists messenger_messages_page_sender_created_idx
  on public.messenger_messages (page_id, sender_id, created_at desc);

create index if not exists messenger_messages_page_created_idx
  on public.messenger_messages (page_id, created_at desc);

create table if not exists public.messenger_operator_prefs (
  facebook_user_id text primary key,
  theme text not null default 'slate',
  default_ai_replies boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.messenger_pages enable row level security;
alter table public.messenger_messages enable row level security;
alter table public.messenger_operator_prefs enable row level security;

-- No anon/authenticated policies: server uses service_role only (MVP testing dashboard)
