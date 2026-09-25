alter table public.messenger_conversation_state
  add column if not exists ai_memory text,
  add column if not exists ai_state jsonb,
  add column if not exists ai_memory_updated_at timestamptz;

comment on column public.messenger_conversation_state.ai_memory is
  'Running AI summary of this conversation';
comment on column public.messenger_conversation_state.ai_state is
  'AI working state: active booking + pending request';
