-- A booking reserves one real capacity unit:
--   * assigned_resource_id for a service handled by a staff member
--   * resource_id for a directly booked staff member / room / resource
-- Prevent two active bookings from reserving that same unit at once,
-- including when the staff member is assigned through different services.

create extension if not exists btree_gist;

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messenger_bookings_no_capacity_overlap'
      and conrelid = 'public.messenger_bookings'::regclass
  ) then
    alter table public.messenger_bookings
      add constraint messenger_bookings_no_capacity_overlap
      exclude using gist (
        page_id with =,
        (coalesce(assigned_resource_id, resource_id)) with =,
        tstzrange(starts_at, ends_at, '[)') with &&
      )
      where (
        status <> 'cancelled'
        and coalesce(assigned_resource_id, resource_id) is not null
      );
  end if;
end
$migration$;
