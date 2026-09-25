-- One row per AI auto-reply turn, written by code (no LLM involved).
-- Follow-up columns are filled in later by plain events so stats can show
-- whether the AI's answer was enough or a human had to step in.
create table if not exists public.messenger_ai_audit (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  page_id text not null,
  peer_id text not null,
  platform text,
  incoming_mid text,
  reply_mid text,
  outcome text not null check (outcome in ('replied', 'skipped', 'failed')),
  skip_reason text,
  error text,
  route_source text,
  lang text,
  intents text[] not null default '{}',
  photo_items text[] not null default '{}',
  tools jsonb not null default '[]',
  tool_count integer not null default 0,
  tool_failures integer not null default 0,
  photos_queued integer not null default 0,
  photos_sent integer not null default 0,
  photos_added_by_fallback integer not null default 0,
  guards text[] not null default '{}',
  reply_chars integer not null default 0,
  llm_calls integer not null default 0,
  prompt_tokens integer not null default 0,
  completion_tokens integer not null default 0,
  rate_limit_wait_ms integer not null default 0,
  models text[] not null default '{}',
  latency_ms integer,
  customer_replied_at timestamptz,
  human_followup_at timestamptz,
  human_followup_kind text
);

comment on table public.messenger_ai_audit is
  'Automated per-turn log of what the Messenger AI did (route, tools, photos, tokens, outcome) plus follow-up signals';
comment on column public.messenger_ai_audit.guards is
  'Deterministic safety nets that fired on this reply (e.g. photo_fallback, format_cleanup, caption_fix, text_tool_call)';
comment on column public.messenger_ai_audit.human_followup_kind is
  'desk_message or takeover — a human acted in this chat after the AI reply';

create index if not exists messenger_ai_audit_page_created
  on public.messenger_ai_audit (page_id, created_at desc);
create index if not exists messenger_ai_audit_peer_created
  on public.messenger_ai_audit (page_id, peer_id, created_at desc);

alter table public.messenger_ai_audit enable row level security;

create or replace view public.messenger_ai_audit_daily
with (security_invoker = true) as
select
  page_id,
  date_trunc('day', created_at) as day,
  count(*) as turns,
  count(*) filter (where outcome = 'replied') as replied,
  count(*) filter (where outcome = 'skipped') as skipped,
  count(*) filter (where outcome = 'failed') as failed,
  round(avg(latency_ms) filter (where outcome = 'replied')) as avg_latency_ms,
  percentile_cont(0.95) within group (order by latency_ms)
    filter (where outcome = 'replied') as p95_latency_ms,
  sum(prompt_tokens + completion_tokens) as tokens,
  sum(llm_calls) as llm_calls,
  sum(tool_count) as tool_calls,
  sum(tool_failures) as tool_failures,
  sum(photos_sent) as photos_sent,
  count(*) filter (where cardinality(guards) > 0) as replies_with_guards,
  count(*) filter (where customer_replied_at is not null) as customer_replied,
  count(*) filter (where human_followup_at is not null) as human_followups,
  round(
    100.0 * count(*) filter (where human_followup_at is not null)
      / nullif(count(*) filter (where outcome = 'replied'), 0),
    1
  ) as human_followup_pct
from public.messenger_ai_audit
group by page_id, date_trunc('day', created_at);

create or replace view public.messenger_ai_tool_stats
with (security_invoker = true) as
select
  a.page_id,
  t.value ->> 'name' as tool,
  count(*) as calls,
  count(*) filter (where (t.value ->> 'ok') = 'false') as failures,
  count(*) filter (where (t.value ->> 'from_text') = 'true') as written_as_text,
  round(avg((t.value ->> 'ms')::numeric)) as avg_ms,
  max(a.created_at) as last_used_at
from public.messenger_ai_audit a
cross join lateral jsonb_array_elements(a.tools) as t(value)
group by a.page_id, t.value ->> 'name';

create or replace view public.messenger_ai_intent_stats
with (security_invoker = true) as
select
  a.page_id,
  i.intent,
  count(*) as turns,
  count(*) filter (where a.outcome = 'failed') as failed,
  count(*) filter (where a.human_followup_at is not null) as human_followups,
  round(
    100.0 * count(*) filter (where a.human_followup_at is not null) / nullif(count(*), 0),
    1
  ) as human_followup_pct,
  round(avg(a.latency_ms)) as avg_latency_ms,
  round(avg(a.prompt_tokens + a.completion_tokens)) as avg_tokens
from public.messenger_ai_audit a
cross join lateral unnest(a.intents) as i(intent)
group by a.page_id, i.intent;
