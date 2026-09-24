-- Optional icon key for resources (services, rooms, …)
-- Apply in Supabase SQL Editor after schema-resources.sql

alter table public.messenger_resources
  add column if not exists icon text;
