import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type FaqEntry = {
  id: string;
  page_id: string;
  entry_type: "qa" | "info";
  question: string | null;
  content: string;
  created_at: string;
  updated_at: string;
};

function readPageId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return /^[0-9A-Za-z._-]{1,128}$/.test(id) ? id : null;
}

const pageRequired = () =>
  NextResponse.json({ error: "page_id is required" }, { status: 400 });

export async function GET(request: NextRequest) {
  const pageId = readPageId(request.nextUrl.searchParams.get("page_id"));
  if (!pageId) return pageRequired();

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_faqs")
    .select("*")
    .eq("page_id", pageId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ faqs: (data ?? []) as FaqEntry[] });
}

export async function POST(request: NextRequest) {
  let body: {
    page_id?: string;
    entry_type?: "qa" | "info";
    question?: string;
    content?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pageId = readPageId(body.page_id);
  if (!pageId) return pageRequired();

  const entryType = body.entry_type === "qa" ? "qa" : "info";
  const content = body.content?.trim() ?? "";
  const question = body.question?.trim() || null;

  if (!content) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  if (entryType === "qa" && !question) {
    return NextResponse.json(
      { error: "Question is required for Q&A entries" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_faqs")
    .insert({
      page_id: pageId,
      entry_type: entryType,
      question: entryType === "qa" ? question : null,
      content,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ faq: data as FaqEntry });
}

export async function PATCH(request: NextRequest) {
  let body: {
    id?: string;
    page_id?: string;
    entry_type?: "qa" | "info";
    question?: string;
    content?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pageId = readPageId(body.page_id);
  if (!pageId) return pageRequired();

  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const entryType = body.entry_type === "qa" ? "qa" : "info";
  const content = body.content?.trim() ?? "";
  const question = body.question?.trim() || null;

  if (!content) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  if (entryType === "qa" && !question) {
    return NextResponse.json(
      { error: "Question is required for Q&A entries" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_faqs")
    .update({
      entry_type: entryType,
      question: entryType === "qa" ? question : null,
      content,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("page_id", pageId)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "FAQ not found" }, { status: 404 });
  }

  return NextResponse.json({ faq: data as FaqEntry });
}

export async function DELETE(request: NextRequest) {
  const pageId = readPageId(request.nextUrl.searchParams.get("page_id"));
  if (!pageId) return pageRequired();

  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("messenger_faqs")
    .delete()
    .eq("id", id)
    .eq("page_id", pageId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
