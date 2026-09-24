import { NextRequest, NextResponse } from "next/server";
import { reactToPageMessage } from "@/lib/meta";
import { withSyncedReactionPayload } from "@/lib/message-actions";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  let body: {
    page_id?: string;
    recipient_id?: string;
    mid?: string;
    reaction?: string | null;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pageId = body.page_id?.trim();
  const recipientId = body.recipient_id?.trim();
  const mid = body.mid?.trim();
  const reaction =
    typeof body.reaction === "string" && body.reaction.trim()
      ? body.reaction.trim()
      : null;

  if (!pageId || !recipientId || !mid) {
    return NextResponse.json(
      { error: "page_id, recipient_id, and mid are required" },
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

  const { data: existing } = await supabase
    .from("messenger_messages")
    .select("id, raw_payload")
    .eq("page_id", pageId)
    .eq("mid", mid)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  try {
    const result = await reactToPageMessage(
      page.page_access_token,
      recipientId,
      mid,
      reaction,
    );

    const nextRaw = withSyncedReactionPayload(
      existing.raw_payload,
      "page_reaction",
      reaction,
    );

    const { error: updateError } = await supabase
      .from("messenger_messages")
      .update({
        page_reaction: reaction,
        raw_payload: nextRaw,
      })
      .eq("id", existing.id);

    if (updateError) {
      console.error("react update error", updateError.message);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, result, reaction });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "React failed" },
      { status: 502 },
    );
  }
}
