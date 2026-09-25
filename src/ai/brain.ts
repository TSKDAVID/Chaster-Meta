import { loadBookingSettings } from "@/lib/booking-ops";
import { listCatalogItems } from "@/lib/catalog";
import {
  generateMessengerReply,
  isAiAutoReplyEnabled,
  type BookingToolContext,
  type ChatTurn,
  type FaqKnowledgeItem,
} from "@/ai/groq";
import { sendPageTextMessage } from "@/lib/meta";
import { loadPeerThread } from "@/lib/message-thread";
import { loadPageProfile } from "@/lib/page-profile";
import { loadActiveResources, toResourceSummary } from "@/lib/resource-ops";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ConversationStatus, MessagePlatform } from "@/lib/types";

export type BrainDecision =
  | { action: "skip"; reason: "ai_disabled" | "empty" | "human" | "ended" | "no_page" }
  | { action: "reply"; replyText: string };

export type BrainContext = {
  pageId: string;
  customerId: string;
  userText: string;
  platform: MessagePlatform;
  status: ConversationStatus;
  history: ChatTurn[];
  knowledge: FaqKnowledgeItem[];
  pageAccessToken: string | null;
  booking: BookingToolContext | null;
  customerName: string | null;
};

async function loadConversationStatus(
  pageId: string,
  customerId: string,
): Promise<ConversationStatus> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("messenger_conversation_state")
    .select("status")
    .eq("page_id", pageId)
    .eq("peer_id", customerId)
    .maybeSingle();

  if (data?.status === "human" || data?.status === "ended") return data.status;
  return "open";
}

async function loadHistory(pageId: string, customerId: string): Promise<ChatTurn[]> {
  const rows = await loadPeerThread<{
    direction: string;
    message_text: string | null;
  }>(pageId, customerId, {
    columns: "direction, message_text, created_at",
    limit: 20,
  }).catch(() => []);

  return rows
    .filter((m) => Boolean(m.message_text))
    .slice(-8)
    .map((m) => ({
      role: (m.direction === "incoming" ? "user" : "assistant") as "user" | "assistant",
      content: m.message_text as string,
    }));
}

async function loadKnowledge(pageId: string): Promise<FaqKnowledgeItem[]> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("messenger_faqs")
    .select("entry_type, question, content")
    .eq("page_id", pageId)
    .order("created_at", { ascending: true })
    .limit(50);

  return (data ?? []).map((row) => ({
    entry_type: row.entry_type as "qa" | "info",
    question: row.question as string | null,
    content: row.content as string,
  }));
}

async function loadCustomerName(
  pageId: string,
  customerId: string,
): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  const { data: contact } = await supabase
    .from("messenger_contacts")
    .select("display_name")
    .eq("page_id", pageId)
    .eq("peer_id", customerId)
    .maybeSingle();

  if (typeof contact?.display_name === "string" && contact.display_name.trim()) {
    return contact.display_name.trim();
  }

  return null;
}

/** Gather everything the brain needs to decide + reply. */
export async function loadBrainContext(input: {
  pageId: string;
  customerId: string;
  userText: string;
  platform: MessagePlatform;
}): Promise<BrainContext> {
  const supabase = getSupabaseAdmin();
  const [
    { data: page },
    status,
    history,
    knowledge,
    settings,
    customerName,
    resourceRows,
    pageProfile,
    catalogItems,
  ] = await Promise.all([
      supabase
        .from("messenger_pages")
        .select("page_id, page_access_token")
        .eq("page_id", input.pageId)
        .maybeSingle(),
      loadConversationStatus(input.pageId, input.customerId),
      loadHistory(input.pageId, input.customerId),
      loadKnowledge(input.pageId),
      loadBookingSettings(input.pageId),
      loadCustomerName(input.pageId, input.customerId),
      loadActiveResources(input.pageId),
      loadPageProfile(input.pageId),
      listCatalogItems(input.pageId).catch(() => []),
    ]);

  const booking: BookingToolContext = {
    pageId: input.pageId,
    peerId: input.customerId,
    customerName,
    settings,
    resources: resourceRows.map(toResourceSummary),
    pageProfile,
    catalogItems,
    pageAccessToken: page?.page_access_token ?? null,
    platform: input.platform,
  };

  return {
    pageId: input.pageId,
    customerId: input.customerId,
    userText: input.userText.trim(),
    platform: input.platform,
    status,
    history,
    knowledge,
    pageAccessToken: page?.page_access_token ?? null,
    booking,
    customerName,
  };
}

/** Pure decision: should Chaster auto-reply, and with what text? */
export async function decideAndGenerate(ctx: BrainContext): Promise<BrainDecision> {
  if (!isAiAutoReplyEnabled()) return { action: "skip", reason: "ai_disabled" };
  if (!ctx.userText) return { action: "skip", reason: "empty" };
  if (!ctx.pageAccessToken) return { action: "skip", reason: "no_page" };
  if (ctx.status === "human") return { action: "skip", reason: "human" };
  if (ctx.status === "ended") return { action: "skip", reason: "ended" };

  const prior = ctx.history.filter(
    (turn, idx) =>
      !(
        idx === ctx.history.length - 1 &&
        turn.role === "user" &&
        turn.content === ctx.userText
      ),
  );

  const replyText = await generateMessengerReply(
    ctx.userText,
    prior,
    ctx.knowledge,
    ctx.booking,
  );
  const cleaned = replyText.trim().slice(0, 1900);
  if (!cleaned) return { action: "skip", reason: "empty" };

  return { action: "reply", replyText: cleaned };
}

/**
 * Full auto-reply path: load context → decide → send via Meta → store as AI.
 * Returns whether a reply was sent.
 */
export async function runAutoReply(input: {
  pageId: string;
  customerId: string;
  userText: string;
  platform: MessagePlatform;
}): Promise<{ sent: boolean; reason?: string; mid?: string | null }> {
  const ctx = await loadBrainContext(input);
  const decision = await decideAndGenerate(ctx);

  if (decision.action === "skip") {
    return { sent: false, reason: decision.reason };
  }

  const result = await sendPageTextMessage(
    ctx.pageAccessToken!,
    ctx.customerId,
    decision.replyText,
  );

  const supabase = getSupabaseAdmin();
  await supabase.from("messenger_messages").upsert(
    {
      page_id: ctx.pageId,
      sender_id: ctx.pageId,
      recipient_id: ctx.customerId,
      mid: result.message_id ?? null,
      message_text: decision.replyText,
      direction: "outgoing",
      platform: ctx.platform,
      raw_payload: { source: "groq_auto_reply", result },
    },
    { onConflict: "mid", ignoreDuplicates: true },
  );

  return { sent: true, mid: result.message_id ?? null };
}
