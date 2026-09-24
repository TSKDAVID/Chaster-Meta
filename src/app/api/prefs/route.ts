import { NextRequest, NextResponse } from "next/server";
import {
  normalizeAccountId,
  PREFS_PAGE_PREFIX,
  prefsPageId,
} from "@/lib/account-prefs";
import { defaultPrefs, type OperatorPrefs } from "@/lib/prefs";
import {
  isThemeId,
  sanitizeCustomColors,
  type CustomThemeColors,
} from "@/lib/themes";
import { normalizeLocale } from "@/lib/i18n/locales";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** Cached so we don't re-probe a missing table on every request. */
let operatorPrefsTableAvailable: boolean | null = null;

const PREFS_SELECT =
  "theme, default_ai_replies, custom_colors, locale, show_hints";
const PREFS_SELECT_NO_LOCALE = "theme, default_ai_replies, custom_colors";
const PREFS_SELECT_MIN = "theme, default_ai_replies";

type PrefsRow = {
  theme: string | null;
  default_ai_replies: boolean | null;
  custom_colors?: unknown;
  locale?: unknown;
  show_hints?: unknown;
};

function sanitizePrefs(input: Partial<OperatorPrefs> | null | undefined): OperatorPrefs {
  return {
    theme: isThemeId(input?.theme) ? input.theme : defaultPrefs.theme,
    defaultAiReplies:
      typeof input?.defaultAiReplies === "boolean"
        ? input.defaultAiReplies
        : defaultPrefs.defaultAiReplies,
    customColors: sanitizeCustomColors(input?.customColors),
    locale: normalizeLocale(input?.locale),
    showHints:
      typeof input?.showHints === "boolean"
        ? input.showHints
        : defaultPrefs.showHints,
  };
}

function rowToPrefs(row: PrefsRow | null): OperatorPrefs {
  if (!row) return sanitizePrefs({});
  return sanitizePrefs({
    theme: row.theme as OperatorPrefs["theme"],
    defaultAiReplies: row.default_ai_replies ?? undefined,
    customColors: row.custom_colors as CustomThemeColors | undefined,
    locale: typeof row.locale === "string" ? normalizeLocale(row.locale) : undefined,
    showHints: typeof row.show_hints === "boolean" ? row.show_hints : undefined,
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

function isMissingColumnError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const msg = (error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST204" ||
    msg.includes("custom_colors") ||
    msg.includes("show_hints") ||
    msg.includes("locale") ||
    msg.includes("column")
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

function prefsUpsertPayload(facebookUserId: string, prefs: OperatorPrefs) {
  return {
    facebook_user_id: facebookUserId,
    theme: prefs.theme,
    default_ai_replies: prefs.defaultAiReplies,
    custom_colors: prefs.customColors,
    locale: prefs.locale,
    show_hints: prefs.showHints,
    updated_at: new Date().toISOString(),
  };
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
        .select(PREFS_SELECT)
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

      if (isMissingColumnError(error)) {
        const mid = await supabase
          .from("messenger_operator_prefs")
          .select(PREFS_SELECT_NO_LOCALE)
          .eq("facebook_user_id", facebookUserId)
          .maybeSingle();
        if (!mid.error) {
          operatorPrefsTableAvailable = true;
          return NextResponse.json({
            facebook_user_id: facebookUserId,
            prefs: rowToPrefs(mid.data),
            source: mid.data ? "database" : "default",
          });
        }

        const legacy = await supabase
          .from("messenger_operator_prefs")
          .select(PREFS_SELECT_MIN)
          .eq("facebook_user_id", facebookUserId)
          .maybeSingle();
        if (!legacy.error) {
          operatorPrefsTableAvailable = true;
          return NextResponse.json({
            facebook_user_id: facebookUserId,
            prefs: rowToPrefs(legacy.data),
            source: legacy.data ? "database" : "default",
          });
        }
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
      customColors?: CustomThemeColors;
      locale?: string;
      showHints?: boolean;
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
      customColors: body.customColors,
      locale: typeof body.locale === "string" ? normalizeLocale(body.locale) : undefined,
      showHints: typeof body.showHints === "boolean" ? body.showHints : undefined,
    });

    if (operatorPrefsTableAvailable !== false) {
      const supabase = getSupabaseAdmin();
      const full = await supabase
        .from("messenger_operator_prefs")
        .upsert(prefsUpsertPayload(facebookUserId, prefs), {
          onConflict: "facebook_user_id",
        })
        .select(PREFS_SELECT)
        .single();

      if (!full.error) {
        operatorPrefsTableAvailable = true;
        return NextResponse.json({
          facebook_user_id: facebookUserId,
          prefs: rowToPrefs(full.data),
          source: "database",
        });
      }

      if (isMissingColumnError(full.error)) {
        // Schema lag: persist what columns exist, still return full prefs to client.
        const mid = await supabase
          .from("messenger_operator_prefs")
          .upsert(
            {
              facebook_user_id: facebookUserId,
              theme: prefs.theme,
              default_ai_replies: prefs.defaultAiReplies,
              custom_colors: prefs.customColors,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "facebook_user_id" },
          )
          .select(PREFS_SELECT_NO_LOCALE)
          .single();

        if (!mid.error) {
          return NextResponse.json({
            facebook_user_id: facebookUserId,
            prefs,
            source: "database",
          });
        }

        const legacy = await supabase
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
          .select(PREFS_SELECT_MIN)
          .single();

        if (!legacy.error) {
          return NextResponse.json({
            facebook_user_id: facebookUserId,
            prefs,
            source: "database",
          });
        }
      }

      if (!isMissingTableError(full.error)) {
        return NextResponse.json({ error: full.error.message }, { status: 500 });
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
