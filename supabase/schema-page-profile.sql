-- Business hours & place (per Facebook Page)
-- Apply via Supabase SQL editor or migration.

create table if not exists public.messenger_page_profile (
  page_id text primary key references public.messenger_pages (page_id) on delete cascade,
  address_line text,
  city text,
  region text,
  postal_code text,
  country text,
  maps_url text,
  phone text,
  email text,
  timezone text not null default 'Asia/Tbilisi',
  open_time text not null default '09:00',
  close_time text not null default '18:00',
  open_days text[] not null default array['mon','tue','wed','thu','fri']::text[],
  hours_note text,
  updated_at timestamptz not null default now()
);

alter table public.messenger_page_profile enable row level security;
