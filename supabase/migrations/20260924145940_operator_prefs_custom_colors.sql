alter table public.messenger_operator_prefs
  add column if not exists custom_colors jsonb not null default '{"base":"#0c0a09","panel":"#1c1917","accent":"#f97316"}'::jsonb;

comment on column public.messenger_operator_prefs.custom_colors is 'User custom theme: base, panel, accent hex colors';
