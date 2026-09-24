-- End-chat summaries + FAQ suggestions for approval
-- Run in Supabase SQL Editor

create table if not exists public.messenger_conversation_state (
  page_id text not null,
  peer_id text not null,
  status text not null default 'open' check (status in ('open', 'human', 'ended')),
  last_summary text,
  ended_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (page_id, peer_id)
);

-- If the table already exists from an earlier version, widen the status check:
do $$
begin
  alter table public.messenger_conversation_state
    drop constraint if exists messenger_conversation_state_status_check;
  alter table public.messenger_conversation_state
    add constraint messenger_conversation_state_status_check
    check (status in ('open', 'human', 'ended'));
exception
  when undefined_table then null;
end $$;

create table if not exists public.messenger_faq_suggestions (
  id uuid primary key default gen_random_uuid(),
  page_id text not null,
  peer_id text not null,
  chat_summary text not null,
  entry_type text not null check (entry_type in ('qa', 'info')),
  question text,
  content text not null,
  overlap_note text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint messenger_faq_suggestions_qa_needs_question check (
    entry_type <> 'qa' or (question is not null and length(trim(question)) > 0)
  )
);

create index if not exists messenger_faq_suggestions_status_idx
  on public.messenger_faq_suggestions (status, created_at desc);

alter table public.messenger_conversation_state enable row level security;
alter table public.messenger_faq_suggestions enable row level security;
