-- Enable live booking updates for the operator desk (Realtime).
-- Apply: npx supabase db query --linked -f supabase/schema-bookings-realtime.sql

alter table public.messenger_bookings replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.messenger_bookings;
exception
  when duplicate_object then null;
end $$;

-- Desk currently reads bookings via service-role APIs; anon SELECT is for Realtime only.
drop policy if exists messenger_bookings_realtime_select on public.messenger_bookings;
create policy messenger_bookings_realtime_select
  on public.messenger_bookings
  for select
  to anon, authenticated
  using (true);
