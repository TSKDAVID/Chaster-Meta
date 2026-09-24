-- Customer display names (resolved from Meta User Profile API)
-- Run in Supabase SQL Editor

create table if not exists public.messenger_contacts (
  page_id text not null,
  peer_id text not null,
  platform text not null default 'messenger' check (platform in ('messenger', 'instagram')),
  display_name text,
  first_name text,
  last_name text,
  username text,
  profile_pic text,
  updated_at timestamptz not null default now(),
  primary key (page_id, peer_id)
);

create index if not exists messenger_contacts_page_name_idx
  on public.messenger_contacts (page_id, display_name);

alter table public.messenger_contacts enable row level security;
