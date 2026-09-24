import { NextRequest, NextResponse } from "next/server";
import {
  checkAvailability,
  isCapacityConflictError,
  loadBookingSettings,
} from "@/lib/booking-ops";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { BookingStatus } from "@/lib/types";

function isSafeMetaId(value: string) {
  return /^[0-9A-Za-z._-]{1,128}$/.test(value);
}

function normalizeStatus(value: unknown): BookingStatus {
  if (
    value === "pending" ||
    value === "cancelled" ||
    value === "completed" ||
    value === "confirmed"
  ) {
    return value;
  }
  return "confirmed";
}

function ymdInZone(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function hmInZone(iso: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h === "24" ? "00" : h}:${m}`;
}

export async function GET(request: NextRequest) {
  const pageId = request.nextUrl.searchParams.get("page_id")?.trim() ?? "";
  const peerId = request.nextUrl.searchParams.get("peer_id")?.trim() ?? "";
  const from = request.nextUrl.searchParams.get("from")?.trim() ?? "";
  const to = request.nextUrl.searchParams.get("to")?.trim() ?? "";

  if (!pageId || !isSafeMetaId(pageId)) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }
  if (peerId && !isSafeMetaId(peerId)) {
    return NextResponse.json({ error: "invalid peer_id" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("messenger_bookings")
    .select("*")
    .eq("page_id", pageId)
    .order("starts_at", { ascending: true })
    .limit(200);

  if (peerId) query = query.eq("peer_id", peerId);
  if (from) query = query.gte("starts_at", from);
  if (to) query = query.lte("starts_at", to);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ bookings: data ?? [] });
}

export async function POST(request: NextRequest) {
  let body: {
    page_id?: string;
    peer_id?: string | null;
    customer_name?: string | null;
    service_label?: string | null;
    notes?: string | null;
    starts_at?: string;
    ends_at?: string;
    status?: string;
    source?: string;
    resource_id?: string | null;
    assignment?: "any" | "specific";
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pageId = body.page_id?.trim() ?? "";
  const startsAt = body.starts_at?.trim() ?? "";
  const endsAt = body.ends_at?.trim() ?? "";
  const peerId = body.peer_id?.trim() || null;

  if (!pageId || !isSafeMetaId(pageId)) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }
  if (peerId && !isSafeMetaId(peerId)) {
    return NextResponse.json({ error: "invalid peer_id" }, { status: 400 });
  }
  if (!startsAt || !endsAt) {
    return NextResponse.json(
      { error: "starts_at and ends_at are required" },
      { status: 400 },
    );
  }
  if (+new Date(endsAt) <= +new Date(startsAt)) {
    return NextResponse.json(
      { error: "ends_at must be after starts_at" },
      { status: 400 },
    );
  }

  const settings = await loadBookingSettings(pageId);
  let assignedResourceId: string | null = body.resource_id?.trim() || null;
  let assignedCapacityId: string | null = null;

  if (settings.enabled) {
    const date = ymdInZone(startsAt, settings.timezone);
    const time =
      settings.booking_mode === "hourly"
        ? hmInZone(startsAt, settings.timezone)
        : null;
    const end_date =
      settings.booking_mode === "multi_day"
        ? ymdInZone(endsAt, settings.timezone)
        : null;

    const specificId = body.resource_id?.trim() || null;
    const wantSpecific =
      body.assignment === "specific" || Boolean(specificId);

    const availability = await checkAvailability({
      pageId,
      settings,
      date,
      time,
      end_date,
      resourceId: wantSpecific ? specificId : null,
    });

    if (!availability.ok || !availability.available) {
      return NextResponse.json(
        { error: availability.message },
        { status: 409 },
      );
    }

    assignedResourceId = availability.resource_id ?? null;
    assignedCapacityId = availability.assigned_resource_id ?? null;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_bookings")
    .insert({
      page_id: pageId,
      peer_id: peerId,
      customer_name: body.customer_name?.trim() || null,
      service_label: body.service_label?.trim() || null,
      notes: body.notes?.trim() || null,
      resource_id: assignedResourceId,
      assigned_resource_id: assignedCapacityId,
      starts_at: startsAt,
      ends_at: endsAt,
      status: normalizeStatus(body.status),
      source: body.source === "ai" ? "ai" : "desk",
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error: isCapacityConflictError(error)
          ? "That team member was just booked for another service. Please choose another time."
          : error.message,
      },
      { status: isCapacityConflictError(error) ? 409 : 500 },
    );
  }

  return NextResponse.json({ booking: data });
}

export async function PATCH(request: NextRequest) {
  let body: {
    id?: string;
    status?: string;
    starts_at?: string;
    ends_at?: string;
    customer_name?: string | null;
    service_label?: string | null;
    notes?: string | null;
    peer_id?: string | null;
    resource_id?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const id = body.id?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (body.status) patch.status = normalizeStatus(body.status);
  if (body.starts_at) patch.starts_at = body.starts_at;
  if (body.ends_at) patch.ends_at = body.ends_at;
  if (body.customer_name !== undefined) {
    patch.customer_name = body.customer_name?.trim() || null;
  }
  if (body.service_label !== undefined) {
    patch.service_label = body.service_label?.trim() || null;
  }
  if (body.notes !== undefined) patch.notes = body.notes?.trim() || null;
  if (body.resource_id !== undefined) {
    patch.resource_id = body.resource_id?.trim() || null;
  }
  if (body.peer_id !== undefined) {
    const peer = body.peer_id?.trim() || null;
    if (peer && !isSafeMetaId(peer)) {
      return NextResponse.json({ error: "invalid peer_id" }, { status: 400 });
    }
    patch.peer_id = peer;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_bookings")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      {
        error: isCapacityConflictError(error)
          ? "That team member is already booked for another service at this time."
          : error.message,
      },
      { status: isCapacityConflictError(error) ? 409 : 500 },
    );
  }

  return NextResponse.json({ booking: data });
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("messenger_bookings").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
