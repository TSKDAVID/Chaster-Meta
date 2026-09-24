-- Open days for store (booking settings) and per-resource overrides
-- Apply after schema-resources.sql / schema-resource-links.sql

alter table public.messenger_booking_settings
  add column if not exists open_days text[] not null
    default array['mon','tue','wed','thu','fri']::text[];

alter table public.messenger_resources
  add column if not exists open_days text[];
-- null open_days on a resource = inherit Page open_days
