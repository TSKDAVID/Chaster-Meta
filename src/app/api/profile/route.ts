import { NextRequest, NextResponse } from "next/server";
import { loadPageProfile, savePageProfile } from "@/lib/page-profile";
import type { PageProfile } from "@/lib/types";

function isSafeMetaId(value: string) {
  return /^[0-9A-Za-z._-]{1,128}$/.test(value);
}

export async function GET(request: NextRequest) {
  const pageId = request.nextUrl.searchParams.get("page_id")?.trim() ?? "";
  if (!pageId || !isSafeMetaId(pageId)) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }

  try {
    const profile = await loadPageProfile(pageId);
    return NextResponse.json({ profile });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load profile" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  let body: Partial<PageProfile> & { page_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pageId = body.page_id?.trim() ?? "";
  if (!pageId || !isSafeMetaId(pageId)) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }

  try {
    const { page_id: _ignored, ...patch } = body;
    const profile = await savePageProfile(pageId, patch);
    return NextResponse.json({ profile });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save profile" },
      { status: 500 },
    );
  }
}
