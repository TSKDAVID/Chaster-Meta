-- Reply + reaction fields on messages
-- Run in Supabase SQL Editor

alter table public.messenger_messages
  add column if not exists reply_to_mid text;

alter table public.messenger_messages
  add column if not exists page_reaction text;

alter table public.messenger_messages
  add column if not exists customer_reaction text;

create index if not exists messenger_messages_reply_to_mid_idx
  on public.messenger_messages (reply_to_mid)
  where reply_to_mid is not null;
