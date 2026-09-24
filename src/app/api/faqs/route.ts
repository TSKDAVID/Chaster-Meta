import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type FaqEntry = {
  id: string;
  entry_type: "qa" | "info";
  question: string | null;
  content: string;
  created_at: string;
  updated_at: string;
};

export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_faqs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ faqs: (data ?? []) as FaqEntry[] });
}

export async function POST(request: NextRequest) {
  let body: {
    entry_type?: "qa" | "info";
    question?: string;
    content?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
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
    .insert({
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
    entry_type?: "qa" | "info";
    question?: string;
    content?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

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
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ faq: data as FaqEntry });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("messenger_faqs").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
