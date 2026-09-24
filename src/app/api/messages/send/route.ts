import { NextRequest, NextResponse } from "next/server";
import { sendPageTextMessage } from "@/lib/meta";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  let body: {
    page_id?: string;
    recipient_id?: string;
    text?: string;
    platform?: "messenger" | "instagram";
    reply_to_mid?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pageId = body.page_id?.trim();
  const recipientId = body.recipient_id?.trim();
  const text = body.text?.trim();
  const platform = body.platform === "instagram" ? "instagram" : "messenger";
  const replyToMid = body.reply_to_mid?.trim() || undefined;

  if (!pageId || !recipientId || !text) {
    return NextResponse.json(
      { error: "page_id, recipient_id, and text are required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: page, error: pageError } = await supabase
    .from("messenger_pages")
    .select("page_id, page_access_token")
    .eq("page_id", pageId)
    .maybeSingle();

  if (pageError || !page) {
    return NextResponse.json({ error: "Page not connected" }, { status: 404 });
  }

  try {
    const result = await sendPageTextMessage(
      page.page_access_token,
      recipientId,
      text,
      replyToMid ? { replyToMid } : undefined,
    );

    const row = {
      page_id: pageId,
      sender_id: pageId,
      recipient_id: recipientId,
      mid: result.message_id ?? null,
      message_text: text,
      direction: "outgoing" as const,
      platform,
      reply_to_mid: replyToMid ?? null,
      raw_payload: {
        source: "desk",
        result,
        ...(replyToMid ? { reply_to: { mid: replyToMid } } : {}),
      },
    };

    let { data: saved, error: saveError } = await supabase
      .from("messenger_messages")
      .insert(row)
      .select("*")
      .maybeSingle();

    // Schema may not have reply_to_mid yet — retry without the column
    if (saveError && /reply_to_mid|schema cache|column/i.test(saveError.message)) {
      const { reply_to_mid: _drop, ...fallback } = row;
      const retry = await supabase
        .from("messenger_messages")
        .insert(fallback)
        .select("*")
        .maybeSingle();
      saved = retry.data;
      saveError = retry.error;
    }

    if (saveError) {
      console.error("save outgoing error", saveError.message);
    }

    return NextResponse.json({ ok: true, result, message: saved });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Send failed" },
      { status: 502 },
    );
  }
}
