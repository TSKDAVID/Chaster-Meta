-- Platform channel on messages (messenger | instagram)
-- Run in Supabase SQL Editor

alter table public.messenger_messages
  add column if not exists platform text not null default 'messenger';

do $$
begin
  alter table public.messenger_messages
    drop constraint if exists messenger_messages_platform_check;
  alter table public.messenger_messages
    add constraint messenger_messages_platform_check
    check (platform in ('messenger', 'instagram'));
exception
  when undefined_table then null;
end $$;

create index if not exists messenger_messages_page_platform_idx
  on public.messenger_messages (page_id, platform);
