-- Operator prefs per Facebook account (theme, AI defaults, locale)
-- Run in Supabase SQL Editor

create table if not exists public.messenger_operator_prefs (
  facebook_user_id text primary key,
  theme text not null default 'chaster',
  default_ai_replies boolean not null default true,
  locale text not null default 'en'
    check (locale in ('en', 'ka')),
  show_hints boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.messenger_operator_prefs enable row level security;
