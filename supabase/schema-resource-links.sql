-- Service kind + resource associations (e.g. service → staff)
-- Apply after schema-resources.sql

-- Allow kind = service
alter table public.messenger_resources
  drop constraint if exists messenger_resources_kind_check;

alter table public.messenger_resources
  add constraint messenger_resources_kind_check
  check (kind in ('staff', 'room', 'equipment', 'service', 'other'));

-- parent (e.g. service) → child (e.g. staff) capacity links
create table if not exists public.messenger_resource_links (
  page_id text not null references public.messenger_pages (page_id) on delete cascade,
  parent_id uuid not null references public.messenger_resources (id) on delete cascade,
  child_id uuid not null references public.messenger_resources (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, child_id),
  constraint messenger_resource_links_no_self check (parent_id <> child_id)
);

create index if not exists messenger_resource_links_page_parent_idx
  on public.messenger_resource_links (page_id, parent_id);

create index if not exists messenger_resource_links_page_child_idx
  on public.messenger_resource_links (page_id, child_id);

-- When booking a composite (service), store which linked unit was reserved
alter table public.messenger_bookings
  add column if not exists assigned_resource_id uuid
    references public.messenger_resources (id) on delete set null;

create index if not exists messenger_bookings_page_assigned_starts_idx
  on public.messenger_bookings (page_id, assigned_resource_id, starts_at);

alter table public.messenger_resource_links enable row level security;
