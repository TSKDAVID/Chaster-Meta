-- Optional icon key for resources (services, rooms, …)
alter table public.messenger_resources
  add column if not exists icon text;

comment on column public.messenger_resources.icon is
  'Lucide icon key for services/rooms (see service-icons catalog).';
