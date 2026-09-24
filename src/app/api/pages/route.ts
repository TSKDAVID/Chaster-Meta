import { NextRequest, NextResponse } from "next/server";
import { PREFS_PAGE_PREFIX } from "@/lib/account-prefs";
import { subscribePageToApp, unsubscribePageFromApp } from "@/lib/meta";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_pages")
    .select("id, page_id, page_name, facebook_user_id, connected_at, updated_at, page_access_token")
    .not("page_id", "like", `${PREFS_PAGE_PREFIX}%`)
    .order("connected_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pages = data ?? [];

  // Refresh webhook field subscription (e.g. message_reactions) without blocking the list
  void Promise.all(
    pages.map(async (page) => {
      if (!page.page_access_token) return;
      try {
        await subscribePageToApp(page.page_id, page.page_access_token);
      } catch (err) {
        console.error(
          "page resubscribe failed",
          page.page_id,
          err instanceof Error ? err.message : err,
        );
      }
    }),
  );

  return NextResponse.json({
    pages: pages.map(({ page_access_token: _token, ...safe }) => safe),
  });
}

export async function DELETE(request: NextRequest) {
  const pageId = request.nextUrl.searchParams.get("page_id");
  if (!pageId) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: page } = await supabase
    .from("messenger_pages")
    .select("page_id, page_access_token")
    .eq("page_id", pageId)
    .maybeSingle();

  if (page?.page_access_token) {
    try {
      await unsubscribePageFromApp(page.page_id, page.page_access_token);
    } catch {
      // continue deleting locally
    }
  }

  const { error } = await supabase.from("messenger_pages").delete().eq("page_id", pageId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
