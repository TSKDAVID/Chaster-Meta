import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") ?? "pending";
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("messenger_faq_suggestions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ suggestions: data ?? [] });
}

export async function POST(request: NextRequest) {
  let body: {
    id?: string;
    action?: "approve" | "reject";
    question?: string | null;
    content?: string;
    entry_type?: "qa" | "info";
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id?.trim();
  const action = body.action;

  if (!id || (action !== "approve" && action !== "reject")) {
    return NextResponse.json(
      { error: "id and action (approve|reject) are required" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  const { data: suggestion, error: loadError } = await supabase
    .from("messenger_faq_suggestions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (loadError || !suggestion) {
    return NextResponse.json(
      { error: loadError?.message ?? "Suggestion not found" },
      { status: 404 },
    );
  }

  if (suggestion.status !== "pending") {
    return NextResponse.json(
      { error: `Suggestion already ${suggestion.status}` },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const entryType =
    body.entry_type === "qa" || body.entry_type === "info"
      ? body.entry_type
      : (suggestion.entry_type as "qa" | "info");

  const editedContent =
    typeof body.content === "string" ? body.content.trim() : String(suggestion.content ?? "").trim();
  const editedQuestion =
    typeof body.question === "string"
      ? body.question.trim() || null
      : (suggestion.question as string | null);

  if (action === "approve") {
    if (!editedContent) {
      return NextResponse.json({ error: "content is required to approve" }, { status: 400 });
    }
    if (entryType === "qa" && !editedQuestion) {
      return NextResponse.json(
        { error: "question is required for Q&A entries" },
        { status: 400 },
      );
    }

    const { error: insertError } = await supabase.from("messenger_faqs").insert({
      entry_type: entryType,
      question: entryType === "qa" ? editedQuestion : null,
      content: editedContent,
      updated_at: now,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("messenger_faq_suggestions")
    .update({
      status: action === "approve" ? "approved" : "rejected",
      reviewed_at: now,
      ...(action === "approve"
        ? {
            entry_type: entryType,
            question: entryType === "qa" ? editedQuestion : null,
            content: editedContent || suggestion.content,
          }
        : {}),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ suggestion: updated });
}
