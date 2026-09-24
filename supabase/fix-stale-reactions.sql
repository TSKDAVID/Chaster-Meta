-- Clear stale reaction copies left in raw_payload after column clears
update public.messenger_messages
set raw_payload = coalesce(raw_payload, '{}'::jsonb) - 'page_reaction'
where page_reaction is null
  and raw_payload ? 'page_reaction';

update public.messenger_messages
set raw_payload = coalesce(raw_payload, '{}'::jsonb) - 'customer_reaction'
where customer_reaction is null
  and raw_payload ? 'customer_reaction';
