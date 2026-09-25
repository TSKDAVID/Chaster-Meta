/**
 * One customer message → one reply:
 * load → route → assemble prompt → answer (tools) → clean → send → remember.
 */
import { recordAiTurn } from "@/ai/audit";
import { buildSystemPrompt } from "@/ai/context";
import { captionWithPhotos, toMessengerText } from "@/ai/format";
import {
  generateMessengerReply,
  isAiAutoReplyEnabled,
  newLlmUsage,
  withLlmUsage,
  type ChatTurn,
  type FaqKnowledgeItem,
  type ToolCallTrace,
} from "@/ai/groq";
import {
  applyToolResults,
  formatBookingLine,
  isBookingTurn,
  loadConversationRow,
  mergeRouteIntoState,
  RAW_TURNS_WITH_SUMMARY,
  RAW_TURNS_WITHOUT_SUMMARY,
  reconcileWithUpcoming,
  saveState,
  stateLines,
  updateSummary,
  type AiState,
  type ConversationRow,
} from "@/ai/memory";
import {
  collectAiTools,
  collectSystemPromptSections,
  getEntitlements,
  resolveActiveModules,
  type ModuleContext,
  type ModuleId,
} from "@/ai/modules";
import { turnWantsPhoto } from "@/ai/intents";
import { routeMessage, type Route } from "@/ai/router";
import { deliverQueuedPhotos, queueMatchingPhotos } from "@/ai/tools/media";
import { listCustomerBookings, loadBookingSettings } from "@/lib/booking-ops";
import { listCatalogItems } from "@/lib/catalog";
import { sendPageTextMessage } from "@/lib/meta";
import { loadPeerThread } from "@/lib/message-thread";
import { loadPageProfile } from "@/lib/page-profile";
import { loadActiveResources, toResourceSummary } from "@/lib/resource-ops";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ConversationStatus, MessagePlatform } from "@/lib/types";

const MAX_REPLY_CHARS = 1900;
const THREAD_LIMIT = 24;

export type BrainDecision =
  | {
      action: "skip";
      reason: "ai_disabled" | "empty" | "human" | "ended" | "no_page";
      route?: Route;
      toolCalls?: ToolCallTrace[];
      guards?: string[];
    }
  | {
      action: "reply";
      replyText: string;
      route: Route;
      toolCalls: ToolCallTrace[];
      state: AiState;
      pendingPhotos: Array<{ url: string; itemName?: string }>;
      photosAddedByFallback: number;
      /** Deterministic safety nets that changed this reply (for the audit log). */
      guards: string[];
    };

export type BrainContext = {
  pageId: string;
  customerId: string;
  userText: string;
  platform: MessagePlatform;
  status: ConversationStatus;
  businessName: string;
  /** Thread before the current message, oldest first. */
  history: ChatTurn[];
  conversation: ConversationRow;
  pageAccessToken: string | null;
  customerName: string | null;
  /** Everything loaded for this Page; intents/query are filled in per turn. */
  moduleCtx: ModuleContext;
};

const CAPABILITY_LABELS: Partial<Record<ModuleId, string>> = {
  knowledge: "FAQ answers",
  catalog: "catalog with prices",
  bookings: "appointment booking",
  resources: "staff/services with their own hours",
  hours: "opening hours & location",
  media: "sending product photos",
};

async function loadThread(pageId: string, customerId: string): Promise<ChatTurn[]> {
  const rows = await loadPeerThread<{
    direction: string;
    message_text: string | null;
  }>(pageId, customerId, {
    columns: "direction, message_text, created_at",
    limit: THREAD_LIMIT,
  }).catch(() => []);

  return rows
    .filter((m) => Boolean(m.message_text))
    .filter((m) => {
      const text = (m.message_text as string).trim();
      if (/^\[send_photo\]$/i.test(text)) return false;
      if (/^📷\b/.test(text)) return false;
      return true;
    })
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
    .limit(200);

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
  const userText = input.userText.trim();
  const [
    { data: page },
    conversation,
    thread,
    knowledge,
    settings,
    customerName,
    resourceRows,
    pageProfile,
    catalogItems,
  ] = await Promise.all([
    supabase
      .from("messenger_pages")
      .select("page_id, page_name, page_access_token")
      .eq("page_id", input.pageId)
      .maybeSingle(),
    loadConversationRow(input.pageId, input.customerId),
    loadThread(input.pageId, input.customerId),
    loadKnowledge(input.pageId),
    loadBookingSettings(input.pageId),
    loadCustomerName(input.pageId, input.customerId),
    loadActiveResources(input.pageId),
    loadPageProfile(input.pageId),
    listCatalogItems(input.pageId).catch(() => []),
  ]);

  // The webhook stores the incoming message before replying; keep it out of history.
  const last = thread[thread.length - 1];
  const history =
    last && last.role === "user" && last.content.trim() === userText
      ? thread.slice(0, -1)
      : thread;

  const pageAccessToken = page?.page_access_token ?? null;
  return {
    pageId: input.pageId,
    customerId: input.customerId,
    userText,
    platform: input.platform,
    status: conversation.status,
    businessName: (page?.page_name as string | null)?.trim() || "this business",
    history,
    conversation,
    pageAccessToken,
    customerName,
    moduleCtx: {
      pageId: input.pageId,
      peerId: input.customerId,
      customerName,
      entitlements: getEntitlements(),
      pageAccessToken,
      platform: input.platform,
      bookingSettings: settings,
      resources: resourceRows.map(toResourceSummary),
      knowledge,
      pageProfile,
      catalogItems,
    },
  };
}

/** Match/retrieve from THIS message only — never prior turns (avoids photo bleed). */
function retrievalQuery(ctx: BrainContext, route: Route): string {
  const e = route.entities;
  return [ctx.userText, e.product, e.service, e.staff].filter(Boolean).join(" ");
}

/** Router decides in any language; keywords only cover the router-failed case. */
function wantsPhotoThisTurn(route: Route, ctx: BrainContext): boolean {
  if (route.intents) return route.intents.includes("photo");
  return turnWantsPhoto(ctx.userText, ctx.history);
}

/** Pure decision: should Chaster auto-reply, and with what text? */
export async function decideAndGenerate(ctx: BrainContext): Promise<BrainDecision> {
  if (!isAiAutoReplyEnabled()) return { action: "skip", reason: "ai_disabled" };
  if (!ctx.userText) return { action: "skip", reason: "empty" };
  if (!ctx.pageAccessToken) return { action: "skip", reason: "no_page" };
  if (ctx.status === "human") return { action: "skip", reason: "human" };
  if (ctx.status === "ended") return { action: "skip", reason: "ended" };

  const baseCtx = ctx.moduleCtx;
  const resources = baseCtx.resources ?? [];
  const capabilities = resolveActiveModules(baseCtx)
    .map((m) => CAPABILITY_LABELS[m.id])
    .filter((label): label is string => Boolean(label));

  const route = await routeMessage({
    userText: ctx.userText,
    history: ctx.history,
    capabilities,
  });

  let state = mergeRouteIntoState(ctx.conversation.state, route);

  let customerBookingLines: string[] | undefined;
  const settings = baseCtx.bookingSettings;
  if (settings?.enabled && isBookingTurn(route.intents)) {
    const upcoming = await listCustomerBookings({
      pageId: ctx.pageId,
      peerId: ctx.customerId,
      settings,
    }).catch(() => null);
    if (upcoming?.ok) {
      customerBookingLines = upcoming.bookings.map((b) => formatBookingLine(b, resources));
      state = reconcileWithUpcoming(state, upcoming.bookings, resources);
    }
  }

  const moduleCtx: ModuleContext = {
    ...baseCtx,
    intents: route.intents,
    query: retrievalQuery(ctx, route),
    customerBookingLines,
    pendingPhotos: [],
  };

  const sections = collectSystemPromptSections(moduleCtx);
  const tools = collectAiTools(moduleCtx);
  const summary = ctx.conversation.summary;
  const systemPrompt = buildSystemPrompt({
    businessName: ctx.businessName,
    lang: route.lang,
    timeZone: settings?.timezone ?? baseCtx.pageProfile?.timezone,
    // Booking state only on booking turns, so photo/FAQ replies don't drift into dates.
    memory: { summary, stateLines: isBookingTurn(route.intents) ? stateLines(state) : [] },
    needsHuman: route.needs_human,
    sections,
  });
  const history = ctx.history.slice(
    -(summary ? RAW_TURNS_WITH_SUMMARY : RAW_TURNS_WITHOUT_SUMMARY),
  );

  console.log(
    `[ai-route] ${route.source} lang=${route.lang} intents=${route.intents?.join(",") ?? "ALL"} sections=${sections.length} tools=${tools.map((t) => t.function.name).join(",") || "none"} prompt_chars=${systemPrompt.length} history=${history.length}`,
  );

  const reply = await generateMessengerReply({
    systemPrompt,
    history,
    userText: ctx.userText,
    tools,
    moduleCtx,
  });

  state = applyToolResults(state, reply.toolCalls, resources);

  // Top up with every item named for this photo ask (the model often sends only the first).
  // Only on photo turns, so earlier photo requests never bleed into later replies.
  let photosAddedByFallback = 0;
  if (wantsPhotoThisTurn(route, ctx)) {
    const named = [...route.photo_items, route.entities.product, ctx.userText]
      .filter(Boolean)
      .join(" ");
    photosAddedByFallback = queueMatchingPhotos(moduleCtx, named);
    if (photosAddedByFallback === 0 && !moduleCtx.pendingPhotos?.length) {
      // Bare retry ("try again"): the items were named in the previous message.
      const previousUser = [...ctx.history].reverse().find((t) => t.role === "user")?.content;
      if (previousUser) photosAddedByFallback = queueMatchingPhotos(moduleCtx, previousUser);
    }
  }

  const photos = moduleCtx.pendingPhotos ?? [];
  const formatted = toMessengerText(reply.text);
  let cleaned = captionWithPhotos(formatted, photos).slice(0, MAX_REPLY_CHARS);
  if (!cleaned && photos[0]?.itemName) cleaned = `📷 ${photos[0].itemName}`;

  const guards: string[] = [];
  if (formatted !== reply.text.trim()) guards.push("format_cleanup");
  if (cleaned !== formatted.slice(0, MAX_REPLY_CHARS)) guards.push("caption_fix");
  if (photosAddedByFallback > 0) guards.push("photo_fallback");
  if (reply.toolCalls.some((c) => c.from_text)) guards.push("text_tool_call");

  if (!cleaned && photos.length === 0) {
    return { action: "skip", reason: "empty", route, toolCalls: reply.toolCalls, guards };
  }

  return {
    action: "reply",
    replyText: cleaned,
    route,
    toolCalls: reply.toolCalls,
    state,
    pendingPhotos: photos,
    photosAddedByFallback,
    guards,
  };
}

/** Customers often send 2-3 messages in a row; wait briefly so only the last one is answered. */
const SETTLE_MS = 1500;
const peerQueues = new Map<string, Promise<unknown>>();

/** One reply at a time per conversation, in arrival order. */
function serializePerPeer<T>(key: string, run: () => Promise<T>): Promise<T> {
  const previous = peerQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(run);
  peerQueues.set(key, next);
  void next.finally(() => {
    if (peerQueues.get(key) === next) peerQueues.delete(key);
  });
  return next;
}

async function newerIncomingExists(pageId: string, customerId: string, mid: string) {
  const { data } = await getSupabaseAdmin()
    .from("messenger_messages")
    .select("mid")
    .eq("page_id", pageId)
    .eq("sender_id", customerId)
    .eq("direction", "incoming")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Boolean(data?.mid && data.mid !== mid);
}

/**
 * Full auto-reply path: load context → decide → send via Meta → store as AI → remember.
 * Returns whether a reply was sent.
 */
export async function runAutoReply(input: {
  pageId: string;
  customerId: string;
  userText: string;
  platform: MessagePlatform;
  /** Incoming message id; lets a burst of messages get one reply to the latest. */
  mid?: string | null;
}): Promise<{ sent: boolean; reason?: string; mid?: string | null }> {
  return serializePerPeer(`${input.pageId}:${input.customerId}`, async () => {
    const started = Date.now();
    const audit = {
      pageId: input.pageId,
      peerId: input.customerId,
      platform: input.platform,
      incomingMid: input.mid ?? null,
    };
    if (input.mid) {
      await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
      if (await newerIncomingExists(input.pageId, input.customerId, input.mid)) {
        await recordAiTurn({
          ...audit,
          outcome: "skipped",
          skipReason: "superseded",
          latencyMs: Date.now() - started,
        });
        return { sent: false, reason: "superseded" };
      }
    }

    const usage = newLlmUsage();
    const run: TurnRun = {};
    try {
      const outcome = await withLlmUsage(usage, () => replyNow(input, run));
      await recordAiTurn({
        ...audit,
        outcome: outcome.sent ? "replied" : "skipped",
        skipReason: outcome.reason ?? null,
        replyMid: outcome.mid ?? null,
        route: run.decision?.route ?? null,
        toolCalls: run.decision?.toolCalls,
        photosQueued: run.decision?.action === "reply" ? run.decision.pendingPhotos.length : 0,
        photosSent: run.photosSent ?? 0,
        photosAddedByFallback:
          run.decision?.action === "reply" ? run.decision.photosAddedByFallback : 0,
        guards: [...(run.decision?.guards ?? []), ...(run.extraGuards ?? [])],
        replyChars: run.decision?.action === "reply" ? run.decision.replyText.length : 0,
        usage,
        latencyMs: Date.now() - started,
      });
      return outcome;
    } catch (err) {
      await recordAiTurn({
        ...audit,
        outcome: "failed",
        error: err instanceof Error ? err.message : String(err),
        route: run.decision?.route ?? null,
        toolCalls: run.decision?.toolCalls,
        usage,
        latencyMs: Date.now() - started,
      });
      throw err;
    }
  });
}

/** Filled in while a turn runs so the audit row can describe how far it got. */
type TurnRun = {
  decision?: BrainDecision;
  photosSent?: number;
  extraGuards?: string[];
};

async function replyNow(
  input: {
    pageId: string;
    customerId: string;
    userText: string;
    platform: MessagePlatform;
  },
  run: TurnRun,
): Promise<{ sent: boolean; reason?: string; mid?: string | null }> {
  const ctx = await loadBrainContext(input);
  const decision = await decideAndGenerate(ctx);
  run.decision = decision;

  if (decision.action === "skip") {
    return { sent: false, reason: decision.reason };
  }

  let result: { message_id?: string | null } = { message_id: null };
  if (decision.replyText.trim()) {
    result = await sendPageTextMessage(
      ctx.pageAccessToken!,
      ctx.customerId,
      decision.replyText,
    );
  }

  const delivery = await deliverQueuedPhotos(
    { ...ctx.moduleCtx, pageAccessToken: ctx.pageAccessToken },
    decision.pendingPhotos,
  );
  run.photosSent = delivery.sent;
  if (delivery.failed > 0) run.extraGuards = [`photo_send_failed:${delivery.failed}`];

  const supabase = getSupabaseAdmin();
  if (decision.replyText.trim()) {
    await supabase.from("messenger_messages").upsert(
      {
        page_id: ctx.pageId,
        sender_id: ctx.pageId,
        recipient_id: ctx.customerId,
        mid: result.message_id ?? null,
        message_text: decision.replyText,
        direction: "outgoing",
        platform: ctx.platform,
        raw_payload: {
          source: "groq_auto_reply",
          result,
          route: {
            source: decision.route.source,
            lang: decision.route.lang,
            intents: decision.route.intents ?? null,
            entities: decision.route.entities,
            needs_human: decision.route.needs_human,
          },
          tools: decision.toolCalls.map((c) => ({ name: c.name, ok: c.ok })),
        },
      },
      // Overwrite the Meta echo if it landed first, so the row is labelled AI and keeps the trace.
      { onConflict: "mid" },
    );
  }

  await saveState(ctx.pageId, ctx.customerId, decision.state);
  await updateSummary({
    pageId: ctx.pageId,
    peerId: ctx.customerId,
    previousSummary: ctx.conversation.summary,
    state: decision.state,
  }).catch((err) =>
    console.warn("[ai-memory] summary update failed:", err instanceof Error ? err.message : err),
  );

  return { sent: true, mid: result.message_id ?? null };
}
