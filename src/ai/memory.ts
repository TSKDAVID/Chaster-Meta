/**
 * Conversation memory: a running summary of older turns plus a small
 * working state (the booking being discussed) kept in code, not by the model.
 */
import { callGroq, groqSmallModel } from "@/ai/groq";
import { BOOKING_INTENTS, type Intent } from "@/ai/intents";
import type { Route } from "@/ai/router";
import type { ToolCallTrace } from "@/ai/groq";
import type { BookingSummary } from "@/lib/booking-ops";
import { loadPeerThread } from "@/lib/message-thread";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ConversationStatus, ResourceSummary } from "@/lib/types";

/** Raw turns sent with the prompt when a summary covers everything older. */
export const RAW_TURNS_WITH_SUMMARY = 6;
/** Raw turns sent while no summary exists yet. */
export const RAW_TURNS_WITHOUT_SUMMARY = 6;
const SUMMARY_MAX_CHARS = 900;
const SUMMARY_THREAD_LIMIT = 40;

export type ActiveBooking = {
  id: string;
  service: string | null;
  staff: string | null;
  starts_label: string;
  status: string;
};

export type PendingRequest = {
  action: "book" | "change" | "cancel" | "availability";
  service: string | null;
  staff: string | null;
  date: string | null;
  time: string | null;
};

export type AiState = {
  active_booking: ActiveBooking | null;
  pending: PendingRequest | null;
  /** created_at of the newest message folded into the summary. */
  summarized_through?: string | null;
};

export type ConversationRow = {
  status: ConversationStatus;
  summary: string | null;
  state: AiState;
};

const EMPTY_STATE: AiState = { active_booking: null, pending: null };

function normalizeState(value: unknown): AiState {
  if (!value || typeof value !== "object") return { ...EMPTY_STATE };
  const raw = value as Partial<AiState>;
  return {
    active_booking:
      raw.active_booking && typeof raw.active_booking.id === "string"
        ? raw.active_booking
        : null,
    pending: raw.pending && typeof raw.pending === "object" ? raw.pending : null,
    summarized_through:
      typeof raw.summarized_through === "string" ? raw.summarized_through : null,
  };
}

export async function loadConversationRow(
  pageId: string,
  peerId: string,
): Promise<ConversationRow> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("messenger_conversation_state")
    .select("status, ai_memory, ai_state")
    .eq("page_id", pageId)
    .eq("peer_id", peerId)
    .maybeSingle();

  const status: ConversationStatus =
    data?.status === "human" || data?.status === "ended" ? data.status : "open";
  return {
    status,
    summary: typeof data?.ai_memory === "string" && data.ai_memory.trim() ? data.ai_memory : null,
    state: normalizeState(data?.ai_state),
  };
}

async function saveConversationFields(
  pageId: string,
  peerId: string,
  fields: Record<string, unknown>,
) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("messenger_conversation_state")
    .upsert(
      { page_id: pageId, peer_id: peerId, ...fields },
      { onConflict: "page_id,peer_id" },
    );
  if (error) console.warn("[ai-memory] save failed:", error.message);
}

function staffNameFor(
  booking: BookingSummary,
  resources: ResourceSummary[],
): string | null {
  if (booking.assigned_resource_name) return booking.assigned_resource_name;
  const byId = new Map(resources.map((r) => [r.id, r]));
  const assigned = booking.assigned_resource_id ? byId.get(booking.assigned_resource_id) : null;
  if (assigned) return assigned.name;
  const primary = booking.resource_id ? byId.get(booking.resource_id) : null;
  if (primary && primary.kind !== "service") return primary.name;
  return booking.resource_name && primary?.kind !== "service" ? booking.resource_name : null;
}

function serviceNameFor(booking: BookingSummary, resources: ResourceSummary[]): string | null {
  if (booking.service_label) return booking.service_label;
  const primary = resources.find((r) => r.id === booking.resource_id);
  return primary?.kind === "service" ? primary.name : null;
}

export function toActiveBooking(
  booking: BookingSummary,
  resources: ResourceSummary[],
): ActiveBooking {
  return {
    id: booking.id,
    service: serviceNameFor(booking, resources),
    staff: staffNameFor(booking, resources),
    starts_label: booking.when,
    status: booking.status,
  };
}

export function formatBookingLine(booking: BookingSummary, resources: ResourceSummary[]): string {
  const a = toActiveBooking(booking, resources);
  return `- ${a.starts_label} · ${a.service ?? "appointment"}${a.staff ? ` · with ${a.staff}` : ""} · ${a.status} · id: ${a.id}`;
}

function pendingAction(intents: Intent[]): PendingRequest["action"] | null {
  if (intents.includes("booking_cancel")) return "cancel";
  if (intents.includes("booking_change")) return "change";
  if (intents.includes("booking_new")) return "book";
  if (intents.includes("availability")) return "availability";
  return null;
}

/** Fold the router's entities into the pending request (before the reply). */
export function mergeRouteIntoState(state: AiState, route: Route): AiState {
  if (!route.intents) return state;
  const action = pendingAction(route.intents);
  if (!action) return state;
  const prev = state.pending;
  const e = route.entities;
  return {
    ...state,
    pending: {
      action,
      service: e.service ?? e.product ?? prev?.service ?? null,
      staff: e.staff ?? prev?.staff ?? null,
      date: e.date_text ?? prev?.date ?? null,
      time: e.time ?? prev?.time ?? null,
    },
  };
}

function resultBooking(result: unknown, key: "booking" | "existing_booking"): BookingSummary | null {
  if (!result || typeof result !== "object") return null;
  const b = (result as Record<string, unknown>)[key];
  return b && typeof b === "object" && typeof (b as BookingSummary).id === "string"
    ? (b as BookingSummary)
    : null;
}

/** Update the working state from what the tools actually did this turn. */
export function applyToolResults(
  state: AiState,
  calls: ToolCallTrace[],
  resources: ResourceSummary[],
): AiState {
  let next = { ...state };
  for (const call of calls) {
    const booking = resultBooking(call.result, "booking");
    switch (call.name) {
      case "create_booking": {
        if (call.ok && booking) {
          next = { ...next, active_booking: toActiveBooking(booking, resources), pending: null };
        } else {
          const existing = resultBooking(call.result, "existing_booking");
          if (existing) next = { ...next, active_booking: toActiveBooking(existing, resources) };
        }
        break;
      }
      case "update_booking":
      case "get_booking":
        if (call.ok && booking) {
          next = {
            ...next,
            active_booking: toActiveBooking(booking, resources),
            pending: call.name === "update_booking" ? null : next.pending,
          };
        }
        break;
      case "cancel_booking":
        if (call.ok) next = { ...next, active_booking: null, pending: null };
        break;
      case "list_my_bookings": {
        const list =
          call.ok && call.result && typeof call.result === "object"
            ? ((call.result as { bookings?: BookingSummary[] }).bookings ?? [])
            : null;
        if (list?.length === 1) {
          next = { ...next, active_booking: toActiveBooking(list[0], resources) };
        } else if (list?.length === 0) {
          next = { ...next, active_booking: null };
        }
        break;
      }
    }
  }
  return next;
}

/**
 * Drop a remembered booking the ledger no longer lists as upcoming
 * (cancelled or moved by the operator).
 */
export function reconcileWithUpcoming(
  state: AiState,
  upcoming: BookingSummary[] | null,
  resources: ResourceSummary[],
): AiState {
  if (!upcoming) return state;
  const active = state.active_booking;
  if (active) {
    const fresh = upcoming.find((b) => b.id === active.id);
    return { ...state, active_booking: fresh ? toActiveBooking(fresh, resources) : null };
  }
  if (upcoming.length === 1) {
    return { ...state, active_booking: toActiveBooking(upcoming[0], resources) };
  }
  return state;
}

export function stateLines(state: AiState): string[] {
  const lines: string[] = [];
  const a = state.active_booking;
  if (a) {
    lines.push(
      `- Booking in this chat: ${a.service ?? "appointment"}${a.staff ? ` with ${a.staff}` : ""}, ${a.starts_label}, ${a.status} (booking_id: ${a.id}). To change or cancel it use update_booking / cancel_booking with this id — never create a duplicate.`,
    );
  }
  const p = state.pending;
  if (p) {
    const bits = [
      p.service && `service: ${p.service}`,
      p.staff && `staff: ${p.staff}`,
      p.date && `day: ${p.date}`,
      p.time && `time: ${p.time}`,
    ].filter(Boolean);
    if (bits.length) lines.push(`- Customer's current request (${p.action}): ${bits.join(", ")}`);
  }
  return lines;
}

export function isBookingTurn(intents: Intent[] | undefined): boolean {
  return !intents || intents.some((i) => BOOKING_INTENTS.includes(i));
}

export async function saveState(pageId: string, peerId: string, state: AiState) {
  await saveConversationFields(pageId, peerId, { ai_state: state });
}

/**
 * Fold messages that slid out of the raw-turn window into the running
 * summary. Runs after the reply is sent; skipped for short threads.
 */
export async function updateSummary(input: {
  pageId: string;
  peerId: string;
  previousSummary: string | null;
  state: AiState;
}): Promise<void> {
  const rows = await loadPeerThread<{
    direction: string;
    message_text: string | null;
    created_at: string;
  }>(input.pageId, input.peerId, {
    columns: "direction, message_text, created_at",
    limit: SUMMARY_THREAD_LIMIT,
  }).catch(() => []);

  const thread = rows.filter((m) => Boolean(m.message_text));
  if (thread.length <= RAW_TURNS_WITH_SUMMARY) return;

  const older = thread.slice(0, -RAW_TURNS_WITH_SUMMARY);
  const through = input.state.summarized_through;
  const fresh = through ? older.filter((m) => m.created_at > through) : older;
  if (fresh.length === 0) return;

  const transcript = fresh
    .map((m) => `${m.direction === "incoming" ? "Customer" : "Business"}: ${m.message_text}`)
    .join("\n");

  const choice = await callGroq({
    model: groqSmallModel(),
    temperature: 0.1,
    maxCompletionTokens: 700,
    reasoningEffort: "low",
    maxWaitMs: 30_000,
    messages: [
      {
        role: "system",
        content: `You maintain a short memory of a customer chat for a business assistant.
Merge the new messages into the existing summary. Keep: who the customer is, what they want or asked, facts and prices the business already told them, bookings made/changed/cancelled (with day, time, staff), promises made, and open questions.
Drop greetings and small talk. Write in English, plain text, at most 8 short lines. Return only the updated summary.`,
      },
      {
        role: "user",
        content: `Existing summary:\n${input.previousSummary ?? "(none)"}\n\nNew messages:\n${transcript}`,
      },
    ],
  });

  const summary = (choice.message?.content ?? "").trim().slice(0, SUMMARY_MAX_CHARS);
  if (!summary) return;

  await saveConversationFields(input.pageId, input.peerId, {
    ai_memory: summary,
    ai_memory_updated_at: new Date().toISOString(),
    ai_state: { ...input.state, summarized_through: fresh[fresh.length - 1].created_at },
  });
}
