import { NextRequest, NextResponse } from "next/server";
import { isBrokenDisplayName, resolveAndStoreContact } from "@/lib/contacts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  ConversationStatus,
  ConversationSummary,
  MessagePlatform,
  MessengerMessage,
} from "@/lib/types";

function peerIdForMessage(msg: MessengerMessage, pageId: string): string {
  if (msg.direction === "incoming") return msg.sender_id;
  if (msg.recipient_id !== pageId) return msg.recipient_id;
  return msg.sender_id === pageId ? msg.recipient_id : msg.sender_id;
}

function isSafeMetaId(value: string) {
  return /^[0-9A-Za-z._-]{1,128}$/.test(value);
}

function normalizePlatform(value: unknown): MessagePlatform {
  return value === "instagram" ? "instagram" : "messenger";
}

export async function GET(request: NextRequest) {
  const pageId = request.nextUrl.searchParams.get("page_id");
  const peerId = request.nextUrl.searchParams.get("peer_id");
  const platformFilter = request.nextUrl.searchParams.get("platform");

  if (!pageId || !isSafeMetaId(pageId)) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }

  if (peerId && !isSafeMetaId(peerId)) {
    return NextResponse.json({ error: "invalid peer_id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("messenger_messages")
    .select("*")
    .eq("page_id", pageId)
    .order("created_at", { ascending: true })
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const messages = ((data ?? []) as MessengerMessage[]).map((msg) => ({
    ...msg,
    platform: normalizePlatform(msg.platform),
  }));

  if (peerId) {
    const thread = messages.filter((msg) => peerIdForMessage(msg, pageId) === peerId);
    return NextResponse.json({ messages: thread });
  }

  const [{ data: states }, { data: contacts }, { data: page }] = await Promise.all([
    supabase
      .from("messenger_conversation_state")
      .select("peer_id, status")
      .eq("page_id", pageId),
    supabase
      .from("messenger_contacts")
      .select("peer_id, display_name, profile_pic, platform")
      .eq("page_id", pageId),
    supabase
      .from("messenger_pages")
      .select("page_access_token")
      .eq("page_id", pageId)
      .maybeSingle(),
  ]);

  const statusByPeer = new Map<string, ConversationStatus>();
  for (const row of states ?? []) {
    const status =
      row.status === "human" || row.status === "ended" ? row.status : "open";
    statusByPeer.set(row.peer_id, status);
  }

  const contactByPeer = new Map<
    string,
    { display_name: string | null; profile_pic: string | null }
  >();
  for (const row of contacts ?? []) {
    contactByPeer.set(row.peer_id, {
      display_name: row.display_name,
      profile_pic: row.profile_pic,
    });
  }

  const byPeer = new Map<string, ConversationSummary>();

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    const peer = peerIdForMessage(msg, pageId);
    const existing = byPeer.get(peer);
    const contact = contactByPeer.get(peer);
    if (!existing) {
      byPeer.set(peer, {
        peer_id: peer,
        display_name: contact?.display_name ?? null,
        profile_pic: contact?.profile_pic ?? null,
        last_message_text: msg.message_text,
        last_message_at: msg.created_at,
        last_direction: msg.direction,
        message_count: 1,
        platform: msg.platform,
        status: statusByPeer.get(peer) ?? "open",
      });
    } else {
      existing.message_count += 1;
      // Newest row may be non-text; keep looking older for a preview
      if (!existing.last_message_text?.trim() && msg.message_text?.trim()) {
        existing.last_message_text = msg.message_text;
      }
    }
  }

  // Backfill / repair missing or corrupted names automatically
  if (page?.page_access_token) {
    const missing = Array.from(byPeer.values())
      .filter((c) => isBrokenDisplayName(c.display_name))
      .slice(0, 8);

    await Promise.all(
      missing.map(async (c) => {
        const resolved = await resolveAndStoreContact({
          pageId,
          peerId: c.peer_id,
          pageAccessToken: page.page_access_token,
          platform: c.platform,
          force: true,
        });
        if (resolved?.display_name) {
          const row = byPeer.get(c.peer_id);
          if (row) {
            row.display_name = resolved.display_name;
            row.profile_pic = resolved.profile_pic;
          }
        }
      }),
    );
  }

  let conversations = Array.from(byPeer.values()).sort(
    (a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at),
  );

  if (platformFilter === "messenger" || platformFilter === "instagram") {
    conversations = conversations.filter((c) => c.platform === platformFilter);
  }

  return NextResponse.json({ conversations });
}
