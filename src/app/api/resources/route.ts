import { NextRequest, NextResponse } from "next/server";
import {
  createResource,
  deleteResource,
  listResources,
  updateResource,
} from "@/lib/resource-ops";
import { normalizeOptionalOpenDays } from "@/lib/bookings";
import type { ResourceKind } from "@/lib/types";

function isSafeMetaId(value: string) {
  return /^[0-9A-Za-z._-]{1,128}$/.test(value);
}

function normalizeKind(value: unknown): ResourceKind | undefined {
  if (
    value === "staff" ||
    value === "room" ||
    value === "equipment" ||
    value === "service" ||
    value === "other"
  ) {
    return value;
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const pageId = request.nextUrl.searchParams.get("page_id")?.trim() ?? "";
  const includeInactive =
    request.nextUrl.searchParams.get("include_inactive") === "1";

  if (!pageId || !isSafeMetaId(pageId)) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }

  try {
    const resources = await listResources(pageId, { includeInactive });
    return NextResponse.json({ resources });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list resources";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: {
    page_id?: string;
    name?: string;
    kind?: string;
    notes?: string | null;
    open_time?: string | null;
    close_time?: string | null;
    open_days?: string[] | null;
    sort_order?: number;
    active?: boolean;
    linked_ids?: string[];
    serviceable?: boolean;
  };
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
    const resource = await createResource({
      pageId,
      name: body.name ?? "",
      kind: normalizeKind(body.kind),
      notes: body.notes,
      open_time: body.open_time,
      close_time: body.close_time,
      open_days: normalizeOptionalOpenDays(body.open_days),
      sort_order: body.sort_order,
      active: body.active,
      linked_ids: body.linked_ids,
      serviceable:
        typeof body.serviceable === "boolean" ? body.serviceable : undefined,
    });
    return NextResponse.json({ resource });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create resource";
    const status = message.includes("required") || message.includes("not found") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  let body: {
    page_id?: string;
    id?: string;
    name?: string;
    kind?: string;
    notes?: string | null;
    open_time?: string | null;
    close_time?: string | null;
    open_days?: string[] | null;
    sort_order?: number;
    active?: boolean;
    linked_ids?: string[];
    serviceable?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const pageId = body.page_id?.trim() ?? "";
  const id = body.id?.trim() ?? "";
  if (!pageId || !isSafeMetaId(pageId)) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    const resource = await updateResource({
      pageId,
      id,
      name: body.name,
      kind: normalizeKind(body.kind),
      notes: body.notes,
      open_time: body.open_time,
      close_time: body.close_time,
      open_days:
        body.open_days !== undefined
          ? normalizeOptionalOpenDays(body.open_days)
          : undefined,
      sort_order: body.sort_order,
      active: body.active,
      linked_ids: body.linked_ids,
      serviceable:
        typeof body.serviceable === "boolean" ? body.serviceable : undefined,
    });
    return NextResponse.json({ resource });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update resource";
    const status = message.includes("required") || message.includes("not found") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: NextRequest) {
  const pageId = request.nextUrl.searchParams.get("page_id")?.trim() ?? "";
  const id = request.nextUrl.searchParams.get("id")?.trim() ?? "";

  if (!pageId || !isSafeMetaId(pageId)) {
    return NextResponse.json({ error: "page_id required" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  try {
    await deleteResource(pageId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete resource";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
