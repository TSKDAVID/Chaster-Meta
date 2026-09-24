import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_BOOKING_SETTINGS,
  normalizeOpenDays,
} from "@/lib/bookings";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { BookingMode, BookingSettings } from "@/lib/types";

function isSafeMetaId(value: string) {
  return /^[0-9A-Za-z._-]{1,128}$/.test(value);
}

function normalizeMode(value: unknown): BookingMode {
  if (value === "day" || value === "multi_day" || value === "hourly") return value;
  return "hourly";
}

function normalizeSettings(
  pageId: string,
  row: Partial<BookingSettings> | null,
): BookingSettings {
  return {
    page_id: pageId,
    enabled: row?.enabled ?? DEFAULT_BOOKING_SETTINGS.enabled,
    booking_mode: normalizeMode(row?.booking_mode),
    slot_minutes: row?.slot_minutes ?? DEFAULT_BOOKING_SETTINGS.slot_minutes,
    open_time: row?.open_time ?? DEFAULT_BOOKING_SETTINGS.open_time,
    close_time: row?.close_time ?? DEFAULT_BOOKING_SETTINGS.close_time,
    open_days: normalizeOpenDays(
      row?.open_days ?? DEFAULT_BOOKING_SETTINGS.open_days,
    ),
    timezone: row?.timezone ?? DEFAULT_BOOKING_SETTINGS.timezone,
    buffer_minutes: row?.buffer_minutes ?? DEFAULT_BOOKING_SETTINGS.buffer_minutes,
    max_advance_days: row?.max_advance_days ?? DEFAULT_BOOKING_SETTINGS.max_advance_days,
    updated_at: row?.updated_at,
  };
}

export async function GET(request: NextRequest) {
  const pageId = request.nextUrl.searchParams.get("page_id")?.trim() ?? "";
  if (!pageId || !isSafeMetaId(pageId)) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_booking_settings")
    .select("*")
    .eq("page_id", pageId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: normalizeSettings(pageId, data) });
}

export async function PUT(request: NextRequest) {
  let body: Partial<BookingSettings> & { page_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pageId = body.page_id?.trim() ?? "";
  if (!pageId || !isSafeMetaId(pageId)) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }

  const slot = Number(body.slot_minutes ?? 60);
  const buffer = Number(body.buffer_minutes ?? 0);
  const advance = Number(body.max_advance_days ?? 60);
  const openDays = normalizeOpenDays(body.open_days);

  const row = {
    page_id: pageId,
    enabled: body.enabled !== false,
    booking_mode: normalizeMode(body.booking_mode),
    slot_minutes: [15, 30, 45, 60, 90, 120].includes(slot) ? slot : 60,
    open_time: (body.open_time ?? "09:00").trim() || "09:00",
    close_time: (body.close_time ?? "18:00").trim() || "18:00",
    open_days: openDays,
    timezone: (body.timezone ?? "Asia/Tbilisi").trim() || "Asia/Tbilisi",
    buffer_minutes: Number.isFinite(buffer)
      ? Math.min(14 * 24 * 60, Math.max(0, Math.round(buffer)))
      : 0,
    max_advance_days: Number.isFinite(advance)
      ? Math.min(365, Math.max(1, advance))
      : 60,
    updated_at: new Date().toISOString(),
  };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_booking_settings")
    .upsert(row, { onConflict: "page_id" })
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ settings: normalizeSettings(pageId, data) });
}
