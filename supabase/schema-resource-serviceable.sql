-- Rooms / equipment must opt in before they can perform a service
-- Apply after schema-resources.sql

alter table public.messenger_resources
  add column if not exists serviceable boolean not null default false;

-- Staff can perform services by default; existing staff rows opt in.
update public.messenger_resources
  set serviceable = true
  where kind = 'staff' and serviceable = false;

create index if not exists messenger_resources_page_serviceable_idx
  on public.messenger_resources (page_id, kind, serviceable);
