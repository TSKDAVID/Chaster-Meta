-- Operator prefs per Facebook account (theme, AI defaults)
-- Run in Supabase SQL Editor

create table if not exists public.messenger_operator_prefs (
  facebook_user_id text primary key,
  theme text not null default 'slate',
  default_ai_replies boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.messenger_operator_prefs enable row level security;
