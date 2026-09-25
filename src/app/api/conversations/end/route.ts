import { NextRequest, NextResponse } from "next/server";
import {
  summarizeChatAndSuggestFaqs,
  type FaqKnowledgeItem,
} from "@/ai";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

function isSafeMetaId(value: string) {
  return /^[0-9A-Za-z._-]{1,128}$/.test(value);
}

function peerIdForMessage(
  msg: {
    direction: string;
    sender_id: string;
    recipient_id: string;
  },
  pageId: string,
) {
  if (msg.direction === "incoming") return msg.sender_id;
  if (msg.recipient_id !== pageId) return msg.recipient_id;
  return msg.sender_id === pageId ? msg.recipient_id : msg.sender_id;
}

export async function POST(request: NextRequest) {
  let body: { page_id?: string; peer_id?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pageId = body.page_id?.trim() ?? "";
  const peerId = body.peer_id?.trim() ?? "";

  if (!isSafeMetaId(pageId) || !isSafeMetaId(peerId)) {
    return NextResponse.json(
      { error: "page_id and peer_id are required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();

  const { data: messages, error: messagesError } = await supabase
    .from("messenger_messages")
    .select("direction, message_text, sender_id, recipient_id, created_at")
    .eq("page_id", pageId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (messagesError) {
    return NextResponse.json({ error: messagesError.message }, { status: 500 });
  }

  const thread = (messages ?? []).filter(
    (m) => peerIdForMessage(m, pageId) === peerId && Boolean(m.message_text),
  );

  if (thread.length === 0) {
    return NextResponse.json(
      { error: "No messages in this conversation to summarize" },
      { status: 400 },
    );
  }

  const transcript = thread
    .map((m) => {
      const who = m.direction === "incoming" ? "Customer" : "Agent";
      return `${who}: ${m.message_text}`;
    })
    .join("\n");

  const { data: faqRows } = await supabase
    .from("messenger_faqs")
    .select("entry_type, question, content")
    .order("created_at", { ascending: true })
    .limit(100);

  const existingFaqs: FaqKnowledgeItem[] = (faqRows ?? []).map((row) => ({
    entry_type: row.entry_type as "qa" | "info",
    question: row.question as string | null,
    content: row.content as string,
  }));

  let aiResult;
  try {
    aiResult = await summarizeChatAndSuggestFaqs(transcript, existingFaqs);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "AI summarization failed" },
      { status: 502 },
    );
  }

  const now = new Date().toISOString();

  const { error: stateError } = await supabase.from("messenger_conversation_state").upsert(
    {
      page_id: pageId,
      peer_id: peerId,
      status: "ended",
      last_summary: aiResult.summary,
      ended_at: now,
      updated_at: now,
    },
    { onConflict: "page_id,peer_id" },
  );

  if (stateError) {
    return NextResponse.json({ error: stateError.message }, { status: 500 });
  }

  // Replace prior pending suggestions for this conversation
  await supabase
    .from("messenger_faq_suggestions")
    .delete()
    .eq("page_id", pageId)
    .eq("peer_id", peerId)
    .eq("status", "pending");

  let savedSuggestions: unknown[] = [];
  if (aiResult.suggestions.length > 0) {
    const rows = aiResult.suggestions.map((s) => ({
      page_id: pageId,
      peer_id: peerId,
      chat_summary: aiResult.summary,
      entry_type: s.entry_type,
      question: s.question,
      content: s.content,
      overlap_note: s.overlap_note,
      status: "pending",
    }));

    const { data, error } = await supabase
      .from("messenger_faq_suggestions")
      .insert(rows)
      .select("*");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    savedSuggestions = data ?? [];
  }

  return NextResponse.json({
    ok: true,
    summary: aiResult.summary,
    suggestions: savedSuggestions,
    suggestion_count: savedSuggestions.length,
  });
}

export async function PATCH(request: NextRequest) {
  let body: { page_id?: string; peer_id?: string; status?: "open" | "human" | "ended" };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pageId = body.page_id?.trim() ?? "";
  const peerId = body.peer_id?.trim() ?? "";
  const status =
    body.status === "human" || body.status === "ended" ? body.status : "open";

  if (!isSafeMetaId(pageId) || !isSafeMetaId(peerId)) {
    return NextResponse.json(
      { error: "page_id and peer_id are required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await supabase.from("messenger_conversation_state").upsert(
    {
      page_id: pageId,
      peer_id: peerId,
      status,
      ended_at: status === "ended" ? now : null,
      updated_at: now,
    },
    { onConflict: "page_id,peer_id" },
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, status });
}

export async function GET(request: NextRequest) {
  const pageId = request.nextUrl.searchParams.get("page_id");
  const peerId = request.nextUrl.searchParams.get("peer_id");

  if (!pageId || !peerId || !isSafeMetaId(pageId) || !isSafeMetaId(peerId)) {
    return NextResponse.json(
      { error: "page_id and peer_id are required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_conversation_state")
    .select("*")
    .eq("page_id", pageId)
    .eq("peer_id", peerId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    state: data ?? { page_id: pageId, peer_id: peerId, status: "open" },
  });
}
