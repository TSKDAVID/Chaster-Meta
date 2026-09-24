-- Priced catalog / menu items (per Facebook Page)
-- Apply via Supabase SQL editor or migration.

create table if not exists public.messenger_catalog_items (
  id uuid primary key default gen_random_uuid(),
  page_id text not null references public.messenger_pages (page_id) on delete cascade,
  name text not null,
  description text,
  price numeric(12,2),
  currency text not null default 'GEL',
  unit text,
  category text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messenger_catalog_items_name_len check (char_length(trim(name)) between 1 and 120),
  constraint messenger_catalog_items_price_nonneg check (price is null or price >= 0)
);

create index if not exists messenger_catalog_items_page_sort_idx
  on public.messenger_catalog_items (page_id, sort_order, name);

create index if not exists messenger_catalog_items_page_active_idx
  on public.messenger_catalog_items (page_id, active)
  where active = true;

alter table public.messenger_catalog_items enable row level security;
