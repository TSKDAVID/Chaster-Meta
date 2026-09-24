-- Booking settings + appointments (per Facebook Page)
-- Apply: npx supabase db query --linked -f supabase/schema-bookings.sql

create table if not exists public.messenger_booking_settings (
  page_id text primary key references public.messenger_pages (page_id) on delete cascade,
  enabled boolean not null default true,
  -- hourly | day | multi_day
  booking_mode text not null default 'hourly'
    check (booking_mode in ('hourly', 'day', 'multi_day')),
  slot_minutes integer not null default 60
    check (slot_minutes in (15, 30, 45, 60, 90, 120)),
  open_time text not null default '09:00',
  close_time text not null default '18:00',
  timezone text not null default 'Asia/Tbilisi',
  buffer_minutes integer not null default 0
    check (buffer_minutes >= 0 and buffer_minutes <= 240),
  max_advance_days integer not null default 60
    check (max_advance_days >= 1 and max_advance_days <= 365),
  updated_at timestamptz not null default now()
);

create table if not exists public.messenger_bookings (
  id uuid primary key default gen_random_uuid(),
  page_id text not null references public.messenger_pages (page_id) on delete cascade,
  peer_id text,
  customer_name text,
  service_label text,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  source text not null default 'desk'
    check (source in ('desk', 'ai')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messenger_bookings_range check (ends_at > starts_at)
);

create index if not exists messenger_bookings_page_starts_idx
  on public.messenger_bookings (page_id, starts_at);

create index if not exists messenger_bookings_page_peer_idx
  on public.messenger_bookings (page_id, peer_id)
  where peer_id is not null;

create index if not exists messenger_bookings_page_status_idx
  on public.messenger_bookings (page_id, status, starts_at);

alter table public.messenger_booking_settings enable row level security;
alter table public.messenger_bookings enable row level security;
