alter table public.messenger_catalog_items
  add column if not exists stock_unlimited boolean not null default true,
  add column if not exists stock_qty integer null;

comment on column public.messenger_catalog_items.stock_unlimited is 'True for services or unlimited inventory';
comment on column public.messenger_catalog_items.stock_qty is 'Units on hand when stock_unlimited is false';

alter table public.messenger_catalog_items
  drop constraint if exists messenger_catalog_items_stock_qty_check;

alter table public.messenger_catalog_items
  add constraint messenger_catalog_items_stock_qty_check
  check (stock_qty is null or stock_qty >= 0);
