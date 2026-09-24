-- Bookable resources (staff, rooms, equipment, …) + link on bookings
-- Apply: run in Supabase SQL Editor after schema-bookings.sql

create table if not exists public.messenger_resources (
  id uuid primary key default gen_random_uuid(),
  page_id text not null references public.messenger_pages (page_id) on delete cascade,
  name text not null,
  kind text not null default 'staff'
    check (kind in ('staff', 'room', 'equipment', 'other')),
  active boolean not null default true,
  sort_order integer not null default 0,
  notes text,
  -- Null = inherit Page booking_settings open/close
  open_time text,
  close_time text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists messenger_resources_page_idx
  on public.messenger_resources (page_id, active, sort_order);

alter table public.messenger_bookings
  add column if not exists resource_id uuid
    references public.messenger_resources (id) on delete set null;

create index if not exists messenger_bookings_page_resource_starts_idx
  on public.messenger_bookings (page_id, resource_id, starts_at);

alter table public.messenger_resources enable row level security;
