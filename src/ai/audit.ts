/**
 * Automated audit log: one `messenger_ai_audit` row per AI turn, written by
 * code from what actually happened (no LLM). Follow-up columns are stamped by
 * later events so stats show whether the AI's answer was enough.
 * Never throws — auditing must not break replies.
 */
import type { LlmUsage, ToolCallTrace } from "@/ai/groq";
import type { Route } from "@/ai/router";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { MessagePlatform } from "@/lib/types";

const TABLE = "messenger_ai_audit";
/** A reply only "earns" a follow-up signal within this window. */
const FOLLOWUP_WINDOW_MS = 24 * 60 * 60 * 1000;

export type AuditOutcome = "replied" | "skipped" | "failed";

export type AiTurnAudit = {
  pageId: string;
  peerId: string;
  platform: MessagePlatform;
  incomingMid?: string | null;
  replyMid?: string | null;
  outcome: AuditOutcome;
  skipReason?: string | null;
  error?: string | null;
  route?: Route | null;
  toolCalls?: ToolCallTrace[];
  photosQueued?: number;
  photosSent?: number;
  photosAddedByFallback?: number;
  guards?: string[];
  replyChars?: number;
  usage?: LlmUsage | null;
  latencyMs: number;
};

function toolSummary(calls: ToolCallTrace[]) {
  return calls.map((c) => ({
    name: c.name,
    ok: c.ok,
    ms: c.ms ?? null,
    error: c.error ?? null,
    from_text: Boolean(c.from_text),
  }));
}

export async function recordAiTurn(a: AiTurnAudit): Promise<void> {
  try {
    const calls = a.toolCalls ?? [];
    const { error } = await getSupabaseAdmin()
      .from(TABLE)
      .insert({
        page_id: a.pageId,
        peer_id: a.peerId,
        platform: a.platform,
        incoming_mid: a.incomingMid ?? null,
        reply_mid: a.replyMid ?? null,
        outcome: a.outcome,
        skip_reason: a.skipReason ?? null,
        error: a.error?.slice(0, 500) ?? null,
        route_source: a.route?.source ?? null,
        lang: a.route?.lang ?? null,
        intents: a.route?.intents ?? [],
        photo_items: a.route?.photo_items ?? [],
        tools: toolSummary(calls),
        tool_count: calls.length,
        tool_failures: calls.filter((c) => c.ok === false).length,
        photos_queued: a.photosQueued ?? 0,
        photos_sent: a.photosSent ?? 0,
        photos_added_by_fallback: a.photosAddedByFallback ?? 0,
        guards: a.guards ?? [],
        reply_chars: a.replyChars ?? 0,
        llm_calls: a.usage?.calls ?? 0,
        prompt_tokens: a.usage?.prompt_tokens ?? 0,
        completion_tokens: a.usage?.completion_tokens ?? 0,
        rate_limit_wait_ms: a.usage?.rate_limit_wait_ms ?? 0,
        models: a.usage?.models ?? [],
        latency_ms: Math.round(a.latencyMs),
      });
    if (error) console.warn("[ai-audit] insert failed:", error.message);
  } catch (err) {
    console.warn("[ai-audit] insert failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Stamp the latest AI reply in this chat with a follow-up signal
 * (first one wins; older replies are left alone).
 */
export async function markAiFollowup(
  pageId: string,
  peerId: string,
  kind: "customer_replied" | "desk_message" | "takeover",
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - FOLLOWUP_WINDOW_MS).toISOString();
    const { data } = await supabase
      .from(TABLE)
      .select("id, customer_replied_at, human_followup_at")
      .eq("page_id", pageId)
      .eq("peer_id", peerId)
      .eq("outcome", "replied")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return;

    const now = new Date().toISOString();
    const patch =
      kind === "customer_replied"
        ? data.customer_replied_at
          ? null
          : { customer_replied_at: now }
        : data.human_followup_at
          ? null
          : { human_followup_at: now, human_followup_kind: kind };
    if (!patch) return;

    const { error } = await supabase.from(TABLE).update(patch).eq("id", data.id);
    if (error) console.warn("[ai-audit] follow-up update failed:", error.message);
  } catch (err) {
    console.warn("[ai-audit] follow-up update failed:", err instanceof Error ? err.message : err);
  }
}
