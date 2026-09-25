alter table public.messenger_faqs
  add column if not exists page_id text
    references public.messenger_pages (page_id) on delete cascade;

-- Existing rows predate page scoping; assign them to the only connected page at migration time.
update public.messenger_faqs
  set page_id = '615538428312524'
  where page_id is null;

alter table public.messenger_faqs
  alter column page_id set not null;

create index if not exists messenger_faqs_page_created_idx
  on public.messenger_faqs (page_id, created_at desc);

create index if not exists messenger_messages_page_sender_created_idx
  on public.messenger_messages (page_id, sender_id, created_at desc);

create index if not exists messenger_messages_page_recipient_created_idx
  on public.messenger_messages (page_id, recipient_id, created_at desc);
