alter table public.messenger_operator_prefs
  alter column theme set default 'chaster';

alter table public.messenger_operator_prefs
  alter column custom_colors set default '{"base":"#0D0A1B","panel":"#181529","accent":"#AB97FF"}'::jsonb;
