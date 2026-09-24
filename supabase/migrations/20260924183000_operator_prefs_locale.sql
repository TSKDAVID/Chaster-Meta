alter table public.messenger_operator_prefs
  add column if not exists locale text not null default 'en',
  add column if not exists show_hints boolean not null default true;

alter table public.messenger_operator_prefs
  drop constraint if exists messenger_operator_prefs_locale_check;

alter table public.messenger_operator_prefs
  add constraint messenger_operator_prefs_locale_check
  check (locale in ('en', 'ka'));

comment on column public.messenger_operator_prefs.locale is
  'Operator UI language (en | ka)';
comment on column public.messenger_operator_prefs.show_hints is
  'Show hover help tips in the desk UI';
