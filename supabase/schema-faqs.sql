-- FAQ / knowledge for Messenger AI auto-replies
-- Run in Supabase SQL Editor

create table if not exists public.messenger_faqs (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('qa', 'info')),
  question text,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messenger_faqs_qa_needs_question check (
    entry_type <> 'qa' or (question is not null and length(trim(question)) > 0)
  )
);

create index if not exists messenger_faqs_created_idx
  on public.messenger_faqs (created_at desc);

alter table public.messenger_faqs enable row level security;
