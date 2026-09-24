import { NextResponse } from "next/server";
import { buildFacebookOAuthUrl } from "@/lib/meta";

export async function GET() {
  const state = crypto.randomUUID();
  const response = NextResponse.redirect(buildFacebookOAuthUrl(state));
  response.cookies.set("fb_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
  return response;
}
