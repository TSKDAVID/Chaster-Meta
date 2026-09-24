-- Catalog enrichment: photo, variants, availability, tags
-- (Applied remotely; keep file for local/docs sync.)

alter table public.messenger_catalog_items
  add column if not exists image_url text,
  add column if not exists availability text not null default 'in_stock',
  add column if not exists tags text[] not null default '{}'::text[],
  add column if not exists variants jsonb not null default '[]'::jsonb;
