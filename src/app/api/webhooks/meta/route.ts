import { after, NextRequest, NextResponse } from "next/server";
import { isAiAutoReplyEnabled, runAutoReply } from "@/ai";
import { resolveAndStoreContact } from "@/lib/contacts";
import { getMetaConfig } from "@/lib/meta";
import { withSyncedReactionPayload } from "@/lib/message-actions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { MessagePlatform } from "@/lib/types";

type MessagingEvent = {
  sender?: { id?: string };
  recipient?: { id?: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    reply_to?: { mid?: string; is_self_reply?: boolean };
    [key: string]: unknown;
  };
  reaction?: {
    mid?: string;
    action?: string;
    emoji?: string;
    reaction?: string;
  };
};

function platformFromObject(objectType: string | undefined): MessagePlatform | null {
  if (objectType === "page") return "messenger";
  if (objectType === "instagram") return "instagram";
  return null;
}

function extractReplyToMid(message: MessagingEvent["message"]): string | null {
  const mid = message?.reply_to?.mid;
  return typeof mid === "string" && mid.trim() ? mid.trim() : null;
}

/** Meta webhook verification challenge */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  const { verifyToken } = getMetaConfig();

  if (mode === "subscribe" && token === verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

async function applyCustomerReaction(
  pageId: string,
  reaction: NonNullable<MessagingEvent["reaction"]>,
  rawEvent: MessagingEvent,
) {
  const mid = reaction.mid?.trim();
  if (!mid) return;

  const supabase = getSupabaseAdmin();
  const emoji =
    reaction.action === "unreact"
      ? null
      : (reaction.emoji?.trim() || reaction.reaction?.trim() || null);

  const { data: existing } = await supabase
    .from("messenger_messages")
    .select("id, raw_payload")
    .eq("page_id", pageId)
    .eq("mid", mid)
    .maybeSingle();

  if (!existing) return;

  const nextRaw = {
    ...withSyncedReactionPayload(existing.raw_payload, "customer_reaction", emoji),
    last_reaction_event: rawEvent,
  };

  const { error } = await supabase
    .from("messenger_messages")
    .update({
      customer_reaction: emoji,
      raw_payload: nextRaw,
    })
    .eq("id", existing.id);

  if (error) {
    console.error("customer reaction update error", error.message);
  }
}

/** Receive messaging events, store them, run Chaster brain for auto-replies */
export async function POST(request: NextRequest) {
  let body: {
    object?: string;
    entry?: Array<{
      id?: string;
      messaging?: MessagingEvent[];
    }>;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const platform = platformFromObject(body.object);
  if (!platform) {
    return NextResponse.json({ status: "ignored" });
  }

  const supabase = getSupabaseAdmin();
  const aiEnabled = isAiAutoReplyEnabled();

  for (const entry of body.entry ?? []) {
    const pageId = entry.id;
    if (!pageId) continue;

    for (const event of entry.messaging ?? []) {
      if (event.reaction?.mid) {
        try {
          await applyCustomerReaction(pageId, event.reaction, event);
        } catch (err) {
          console.error(
            "reaction webhook failed",
            err instanceof Error ? err.message : err,
          );
        }
        continue;
      }

      const message = event.message;
      if (!message) continue;

      const isEcho = Boolean(message.is_echo);
      const senderId = event.sender?.id;
      const recipientId = event.recipient?.id;
      if (!senderId || !recipientId) continue;

      const customerId = isEcho ? recipientId : senderId;
      const pageSideId = isEcho ? senderId : recipientId;
      const replyToMid = extractReplyToMid(message);

      if (message.mid) {
        const { data: existing } = await supabase
          .from("messenger_messages")
          .select("id")
          .eq("mid", message.mid)
          .maybeSingle();
        if (existing) continue;
      }

      const row: Record<string, unknown> = {
        page_id: pageId,
        sender_id: isEcho ? pageSideId : customerId,
        recipient_id: isEcho ? customerId : pageSideId,
        mid: message.mid ?? null,
        message_text: message.text ?? null,
        direction: (isEcho ? "outgoing" : "incoming") as "incoming" | "outgoing",
        platform,
        reply_to_mid: replyToMid,
        raw_payload: event,
        created_at: event.timestamp
          ? new Date(event.timestamp).toISOString()
          : new Date().toISOString(),
      };

      // Tag Page echoes when we can tell they came from our AI / desk store already
      if (isEcho) {
        row.raw_payload = { ...(event as object), source: "meta_echo" };
      }

      const write = async (payload: Record<string, unknown>) => {
        if (message.mid) {
          return supabase.from("messenger_messages").upsert(payload, {
            onConflict: "mid",
            ignoreDuplicates: true,
          });
        }
        return supabase.from("messenger_messages").insert(payload);
      };

      let { error } = await write(row);
      if (error && /reply_to_mid|schema cache|column/i.test(error.message)) {
        const { reply_to_mid: _drop, ...fallback } = row;
        ({ error } = await write(fallback));
      }
      if (error) console.error("webhook upsert error", error.message);

      if (!isEcho) {
        try {
          const { data: pageRow } = await supabase
            .from("messenger_pages")
            .select("page_access_token")
            .eq("page_id", pageId)
            .maybeSingle();
          if (pageRow?.page_access_token) {
            await resolveAndStoreContact({
              pageId,
              peerId: customerId,
              pageAccessToken: pageRow.page_access_token,
              platform,
            });
          }
        } catch (err) {
          console.error(
            "contact resolve failed",
            err instanceof Error ? err.message : err,
          );
        }
      }

      if (
        aiEnabled &&
        !isEcho &&
        typeof message.text === "string" &&
        message.text.trim().length > 0
      ) {
        const userText = message.text.trim();
        // Reply after acknowledging Meta so rate-limit waits don't trigger webhook retries.
        after(async () => {
          try {
            const outcome = await runAutoReply({
              pageId,
              customerId,
              userText,
              platform,
            });
            if (!outcome.sent && outcome.reason) {
              console.log("chaster-brain skip", outcome.reason, { pageId, customerId });
            }
          } catch (err) {
            console.error(
              "AI auto-reply failed",
              err instanceof Error ? err.message : err,
            );
          }
        });
      }
    }
  }

  return NextResponse.json({ status: "ok" });
}
