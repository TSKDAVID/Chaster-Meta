import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForUserToken,
  exchangeForLongLivedUserToken,
  getFacebookUserId,
  getUserPages,
  subscribePageToApp,
} from "@/lib/meta";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const savedState = request.cookies.get("fb_oauth_state")?.value;

  const fail = (msg: string) =>
    NextResponse.redirect(`${appUrl}/inbox?error=${encodeURIComponent(msg)}`);

  if (error) {
    return fail(errorDescription || error);
  }

  if (!code || !state || !savedState || state !== savedState) {
    return fail("Invalid OAuth state. Try connecting again.");
  }

  try {
    const shortToken = await exchangeCodeForUserToken(code);
    const longToken = await exchangeForLongLivedUserToken(shortToken);
    const facebookUserId = await getFacebookUserId(longToken);
    const pages = await getUserPages(longToken);

    if (pages.length === 0) {
      return fail("No Facebook Pages found for this account.");
    }

    const supabase = getSupabaseAdmin();
    const subscribeErrors: string[] = [];

    for (const page of pages) {
      const { error: upsertError } = await supabase.from("messenger_pages").upsert(
        {
          page_id: page.id,
          page_name: page.name,
          page_access_token: page.access_token,
          facebook_user_id: facebookUserId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "page_id" },
      );

      if (upsertError) {
        throw new Error(upsertError.message);
      }

      try {
        await subscribePageToApp(page.id, page.access_token);
      } catch (err) {
        subscribeErrors.push(
          `${page.name}: ${err instanceof Error ? err.message : "subscribe failed"}`,
        );
      }
    }

    const response = NextResponse.redirect(
      subscribeErrors.length
        ? `${appUrl}/inbox?connected=${pages.length}&warn=${encodeURIComponent(subscribeErrors.join("; "))}`
        : `${appUrl}/inbox?connected=${pages.length}`,
    );
    response.cookies.delete("fb_oauth_state");
    return response;
  } catch (err) {
    return fail(err instanceof Error ? err.message : "OAuth failed");
  }
}
