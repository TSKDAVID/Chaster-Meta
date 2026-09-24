import {
  DEFAULT_BOOKING_SETTINGS,
  normalizeOpenDays,
  weekdayLabel,
  WEEKDAY_ORDER,
} from "@/lib/bookings";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { PageProfile, WeekdayKey } from "@/lib/types";

export const DEFAULT_PAGE_PROFILE: Omit<PageProfile, "page_id"> = {
  address_line: null,
  city: null,
  region: null,
  postal_code: null,
  country: null,
  maps_url: null,
  phone: null,
  email: null,
  timezone: DEFAULT_BOOKING_SETTINGS.timezone,
  open_time: DEFAULT_BOOKING_SETTINGS.open_time,
  close_time: DEFAULT_BOOKING_SETTINGS.close_time,
  open_days: [...DEFAULT_BOOKING_SETTINGS.open_days],
  hours_note: null,
};

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function normalizeHm(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallback;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function normalizePageProfile(
  pageId: string,
  row: Partial<PageProfile> | null,
): PageProfile {
  return {
    page_id: pageId,
    address_line: trimOrNull(row?.address_line) ?? null,
    city: trimOrNull(row?.city) ?? null,
    region: trimOrNull(row?.region) ?? null,
    postal_code: trimOrNull(row?.postal_code) ?? null,
    country: trimOrNull(row?.country) ?? null,
    maps_url: trimOrNull(row?.maps_url) ?? null,
    phone: trimOrNull(row?.phone) ?? null,
    email: trimOrNull(row?.email) ?? null,
    timezone: trimOrNull(row?.timezone) || DEFAULT_PAGE_PROFILE.timezone,
    open_time: normalizeHm(row?.open_time, DEFAULT_PAGE_PROFILE.open_time),
    close_time: normalizeHm(row?.close_time, DEFAULT_PAGE_PROFILE.close_time),
    open_days: normalizeOpenDays(row?.open_days ?? DEFAULT_PAGE_PROFILE.open_days),
    hours_note: trimOrNull(row?.hours_note) ?? null,
    updated_at: row?.updated_at,
  };
}

export async function loadPageProfile(pageId: string): Promise<PageProfile> {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("messenger_page_profile")
    .select("*")
    .eq("page_id", pageId)
    .maybeSingle();

  // Seed hours from booking settings when profile row is missing
  if (!data) {
    const { data: booking } = await supabase
      .from("messenger_booking_settings")
      .select("timezone, open_time, close_time, open_days")
      .eq("page_id", pageId)
      .maybeSingle();
    if (booking) {
      return normalizePageProfile(pageId, {
        timezone: booking.timezone,
        open_time: booking.open_time,
        close_time: booking.close_time,
        open_days: booking.open_days as WeekdayKey[] | undefined,
      });
    }
  }

  return normalizePageProfile(pageId, data);
}

export async function savePageProfile(
  pageId: string,
  patch: Partial<PageProfile>,
): Promise<PageProfile> {
  const current = await loadPageProfile(pageId);
  const next = normalizePageProfile(pageId, { ...current, ...patch });
  const row = {
    page_id: pageId,
    address_line: next.address_line,
    city: next.city,
    region: next.region,
    postal_code: next.postal_code,
    country: next.country,
    maps_url: next.maps_url,
    phone: next.phone,
    email: next.email,
    timezone: next.timezone,
    open_time: next.open_time,
    close_time: next.close_time,
    open_days: next.open_days,
    hours_note: next.hours_note,
    updated_at: new Date().toISOString(),
  };

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_page_profile")
    .upsert(row, { onConflict: "page_id" })
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);

  // Keep booking hours in sync when that Page already uses bookings
  await supabase
    .from("messenger_booking_settings")
    .update({
      timezone: next.timezone,
      open_time: next.open_time,
      close_time: next.close_time,
      open_days: next.open_days,
      updated_at: new Date().toISOString(),
    })
    .eq("page_id", pageId);

  return normalizePageProfile(pageId, data);
}

export function formatOpenDaysLabel(days: WeekdayKey[]): string {
  if (days.length === 0) return "Closed all week";
  if (days.length === 7) return "Every day";
  const set = new Set(days);
  const ordered = WEEKDAY_ORDER.filter((d) => set.has(d));
  return ordered.map(weekdayLabel).join(", ");
}

export function formatAddressLine(profile: PageProfile): string | null {
  const parts = [
    profile.address_line,
    [profile.city, profile.region].filter(Boolean).join(", ") || null,
    profile.postal_code,
    profile.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function profilePromptSection(profile: PageProfile): string {
  const lines: string[] = ["## Hours & place"];
  const address = formatAddressLine(profile);
  if (address) lines.push(`Address: ${address}`);
  if (profile.maps_url) lines.push(`Maps: ${profile.maps_url}`);
  if (profile.phone) lines.push(`Phone: ${profile.phone}`);
  if (profile.email) lines.push(`Email: ${profile.email}`);
  lines.push(
    `Open: ${profile.open_time}–${profile.close_time} (${profile.timezone})`,
  );
  lines.push(`Days: ${formatOpenDaysLabel(profile.open_days)}`);
  if (profile.hours_note) lines.push(`Note: ${profile.hours_note}`);
  lines.push(
    "Answer location and opening-hours questions from this block. If something is missing, say you do not have it and offer to take a message.",
  );
  return lines.join("\n");
}
