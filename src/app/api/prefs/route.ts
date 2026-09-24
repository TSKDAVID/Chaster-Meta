import { NextRequest, NextResponse } from "next/server";
import {
  normalizeAccountId,
  PREFS_PAGE_PREFIX,
  prefsPageId,
} from "@/lib/account-prefs";
import { defaultPrefs, type OperatorPrefs } from "@/lib/prefs";
import { isThemeId } from "@/lib/themes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Cached so we don't re-probe a missing table on every request. */
let operatorPrefsTableAvailable: boolean | null = null;

function sanitizePrefs(input: Partial<OperatorPrefs> | null | undefined): OperatorPrefs {
  return {
    theme: isThemeId(input?.theme) ? input.theme : defaultPrefs.theme,
    defaultAiReplies:
      typeof input?.defaultAiReplies === "boolean"
        ? input.defaultAiReplies
        : defaultPrefs.defaultAiReplies,
  };
}

function rowToPrefs(row: {
  theme: string | null;
  default_ai_replies: boolean | null;
} | null): OperatorPrefs {
  if (!row) return defaultPrefs;
  return sanitizePrefs({
    theme: row.theme as OperatorPrefs["theme"],
    defaultAiReplies: row.default_ai_replies ?? undefined,
  });
}

function isMissingTableError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("could not find the table")
  );
}

async function loadFromPagesFallback(
  facebookUserId: string,
): Promise<OperatorPrefs | null> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_pages")
    .select("page_name")
    .eq("page_id", prefsPageId(facebookUserId))
    .maybeSingle();

  if (error || !data?.page_name) return null;
  try {
    const parsed = JSON.parse(data.page_name) as Partial<OperatorPrefs>;
    return sanitizePrefs(parsed);
  } catch {
    return null;
  }
}

async function saveToPagesFallback(
  facebookUserId: string,
  prefs: OperatorPrefs,
): Promise<OperatorPrefs> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("messenger_pages").upsert(
    {
      page_id: prefsPageId(facebookUserId),
      page_name: JSON.stringify(prefs),
      page_access_token: PREFS_PAGE_PREFIX,
      facebook_user_id: facebookUserId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "page_id" },
  );

  if (error) throw new Error(error.message);
  return prefs;
}

export async function GET(request: NextRequest) {
  const facebookUserId = normalizeAccountId(
    request.nextUrl.searchParams.get("facebook_user_id"),
  );

  try {
    if (operatorPrefsTableAvailable !== false) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("messenger_operator_prefs")
        .select("theme, default_ai_replies")
        .eq("facebook_user_id", facebookUserId)
        .maybeSingle();

      if (!error) {
        operatorPrefsTableAvailable = true;
        return NextResponse.json({
          facebook_user_id: facebookUserId,
          prefs: rowToPrefs(data),
          source: data ? "database" : "default",
        });
      }

      if (!isMissingTableError(error)) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      operatorPrefsTableAvailable = false;
    }

    const fallback = await loadFromPagesFallback(facebookUserId);
    return NextResponse.json({
      facebook_user_id: facebookUserId,
      prefs: fallback ?? defaultPrefs,
      source: fallback ? "pages_fallback" : "default",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load prefs" },
      { status: 500 },
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      facebook_user_id?: string;
      theme?: string;
      defaultAiReplies?: boolean;
    };

    const facebookUserId = normalizeAccountId(body.facebook_user_id);
    if (!isThemeId(body.theme)) {
      return NextResponse.json({ error: "Invalid theme" }, { status: 400 });
    }
    if (typeof body.defaultAiReplies !== "boolean") {
      return NextResponse.json(
        { error: "defaultAiReplies must be boolean" },
        { status: 400 },
      );
    }

    const prefs = sanitizePrefs({
      theme: body.theme,
      defaultAiReplies: body.defaultAiReplies,
    });

    if (operatorPrefsTableAvailable !== false) {
      const supabase = getSupabaseAdmin();
      const { data, error } = await supabase
        .from("messenger_operator_prefs")
        .upsert(
          {
            facebook_user_id: facebookUserId,
            theme: prefs.theme,
            default_ai_replies: prefs.defaultAiReplies,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "facebook_user_id" },
        )
        .select("theme, default_ai_replies")
        .single();

      if (!error) {
        operatorPrefsTableAvailable = true;
        return NextResponse.json({
          facebook_user_id: facebookUserId,
          prefs: rowToPrefs(data),
          source: "database",
        });
      }

      if (!isMissingTableError(error)) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      operatorPrefsTableAvailable = false;
    }

    const saved = await saveToPagesFallback(facebookUserId, prefs);
    return NextResponse.json({
      facebook_user_id: facebookUserId,
      prefs: saved,
      source: "pages_fallback",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save prefs" },
      { status: 500 },
    );
  }
}
