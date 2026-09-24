import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  normalizeOpenDays,
  normalizeOptionalOpenDays,
} from "@/lib/bookings";
import type { BookableResource, ResourceKind, ResourceSummary, WeekdayKey } from "@/lib/types";

function normalizeKind(value: unknown): ResourceKind {
  if (
    value === "staff" ||
    value === "room" ||
    value === "equipment" ||
    value === "service" ||
    value === "other"
  ) {
    return value;
  }
  return "staff";
}

export function normalizeResource(
  row: Partial<BookableResource> & { id: string; page_id: string; name: string },
  linkedIds: string[] = [],
): BookableResource {
  return {
    id: row.id,
    page_id: row.page_id,
    name: row.name.trim(),
    kind: normalizeKind(row.kind),
    active: row.active !== false,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    notes: row.notes?.trim() || null,
    open_time: row.open_time?.trim() || null,
    close_time: row.close_time?.trim() || null,
    open_days: normalizeOptionalOpenDays(row.open_days),
    linked_ids: linkedIds,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  };
}

export function toResourceSummary(r: BookableResource): ResourceSummary {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    linked_ids: r.linked_ids.length > 0 ? r.linked_ids : undefined,
  };
}

async function loadLinkMap(
  pageId: string,
): Promise<Map<string, string[]>> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_resource_links")
    .select("parent_id, child_id")
    .eq("page_id", pageId)
    .limit(500);

  const map = new Map<string, string[]>();
  if (error) {
    console.warn("[resources] loadLinkMap", error.message);
    return map;
  }
  for (const row of data ?? []) {
    const parent = row.parent_id as string;
    const child = row.child_id as string;
    const list = map.get(parent) ?? [];
    list.push(child);
    map.set(parent, list);
  }
  return map;
}

function attachLinks(
  rows: BookableResource[],
  linkMap: Map<string, string[]>,
): BookableResource[] {
  return rows.map((r) =>
    normalizeResource(r, linkMap.get(r.id) ?? []),
  );
}

/** Active resources for a Page, sorted for deterministic “any” assignment. */
export async function loadActiveResources(
  pageId: string,
): Promise<BookableResource[]> {
  const supabase = getSupabaseAdmin();
  const [{ data, error }, linkMap] = await Promise.all([
    supabase
      .from("messenger_resources")
      .select("*")
      .eq("page_id", pageId)
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true })
      .limit(100),
    loadLinkMap(pageId),
  ]);

  if (error) {
    console.warn("[resources] loadActiveResources", error.message);
    return [];
  }

  return attachLinks(
    (data ?? []).map((row) => normalizeResource(row as BookableResource)),
    linkMap,
  );
}

export async function listResources(
  pageId: string,
  opts?: { includeInactive?: boolean },
): Promise<BookableResource[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("messenger_resources")
    .select("*")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(200);

  if (!opts?.includeInactive) {
    query = query.eq("active", true);
  }

  const [{ data, error }, linkMap] = await Promise.all([query, loadLinkMap(pageId)]);
  if (error) throw new Error(error.message);
  return attachLinks(
    (data ?? []).map((row) => normalizeResource(row as BookableResource)),
    linkMap,
  );
}

export async function getResource(
  pageId: string,
  resourceId: string,
): Promise<BookableResource | null> {
  const supabase = getSupabaseAdmin();
  const [{ data, error }, linkMap] = await Promise.all([
    supabase
      .from("messenger_resources")
      .select("*")
      .eq("id", resourceId)
      .eq("page_id", pageId)
      .maybeSingle(),
    loadLinkMap(pageId),
  ]);

  if (error) throw new Error(error.message);
  if (!data) return null;
  return normalizeResource(data as BookableResource, linkMap.get(resourceId) ?? []);
}

export type CreateResourceInput = {
  pageId: string;
  name: string;
  kind?: ResourceKind;
  notes?: string | null;
  open_time?: string | null;
  close_time?: string | null;
  open_days?: WeekdayKey[] | null;
  sort_order?: number;
  active?: boolean;
  linked_ids?: string[];
};

export async function createResource(
  input: CreateResourceInput,
): Promise<BookableResource> {
  const name = input.name.trim();
  if (!name) throw new Error("name is required");

  const supabase = getSupabaseAdmin();

  let sortOrder = input.sort_order;
  if (sortOrder === undefined) {
    const { data: last } = await supabase
      .from("messenger_resources")
      .select("sort_order")
      .eq("page_id", input.pageId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = (typeof last?.sort_order === "number" ? last.sort_order : -1) + 1;
  }

  const { data, error } = await supabase
    .from("messenger_resources")
    .insert({
      page_id: input.pageId,
      name,
      kind: normalizeKind(input.kind),
      notes: input.notes?.trim() || null,
      open_time: input.open_time?.trim() || null,
      close_time: input.close_time?.trim() || null,
      open_days: normalizeOptionalOpenDays(input.open_days),
      sort_order: sortOrder,
      active: input.active !== false,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .maybeSingle();

  if (error || !data) throw new Error(error?.message ?? "Failed to create resource");

  const created = normalizeResource(data as BookableResource);
  if (input.linked_ids && input.linked_ids.length > 0) {
    return setResourceLinks(input.pageId, created.id, input.linked_ids);
  }
  return created;
}

export type UpdateResourceInput = {
  pageId: string;
  id: string;
  name?: string;
  kind?: ResourceKind;
  notes?: string | null;
  open_time?: string | null;
  close_time?: string | null;
  open_days?: WeekdayKey[] | null;
  sort_order?: number;
  active?: boolean;
  linked_ids?: string[];
};

export async function updateResource(
  input: UpdateResourceInput,
): Promise<BookableResource> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("name is required");
    patch.name = name;
  }
  if (input.kind !== undefined) patch.kind = normalizeKind(input.kind);
  if (input.notes !== undefined) patch.notes = input.notes?.trim() || null;
  if (input.open_time !== undefined) {
    patch.open_time = input.open_time?.trim() || null;
  }
  if (input.close_time !== undefined) {
    patch.close_time = input.close_time?.trim() || null;
  }
  if (input.open_days !== undefined) {
    patch.open_days = normalizeOptionalOpenDays(input.open_days);
  }
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;
  if (input.active !== undefined) patch.active = input.active;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_resources")
    .update(patch)
    .eq("id", input.id)
    .eq("page_id", input.pageId)
    .select("*")
    .maybeSingle();

  if (error || !data) throw new Error(error?.message ?? "Failed to update resource");

  if (input.linked_ids !== undefined) {
    return setResourceLinks(input.pageId, input.id, input.linked_ids);
  }

  return getResource(input.pageId, input.id).then((r) => {
    if (!r) throw new Error("Resource not found after update");
    return r;
  });
}

/** Replace association list for a parent resource (e.g. service → staff). */
export async function setResourceLinks(
  pageId: string,
  parentId: string,
  childIds: string[],
): Promise<BookableResource> {
  const parent = await getResource(pageId, parentId);
  if (!parent) throw new Error("Resource not found");

  const unique = [
    ...new Set(
      childIds
        .map((id) => id.trim())
        .filter((id) => id && id !== parentId),
    ),
  ];

  if (unique.length > 0) {
    const siblings = await listResources(pageId, { includeInactive: true });
    const allowed = new Set(siblings.map((r) => r.id));
    for (const id of unique) {
      if (!allowed.has(id)) {
        throw new Error(`Linked resource not found: ${id}`);
      }
    }
  }

  const supabase = getSupabaseAdmin();
  const { error: delError } = await supabase
    .from("messenger_resource_links")
    .delete()
    .eq("page_id", pageId)
    .eq("parent_id", parentId);
  if (delError) throw new Error(delError.message);

  if (unique.length > 0) {
    const { error: insError } = await supabase
      .from("messenger_resource_links")
      .insert(
        unique.map((child_id) => ({
          page_id: pageId,
          parent_id: parentId,
          child_id,
        })),
      );
    if (insError) throw new Error(insError.message);
  }

  const refreshed = await getResource(pageId, parentId);
  if (!refreshed) throw new Error("Resource not found after linking");
  return refreshed;
}

export async function deleteResource(
  pageId: string,
  id: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("messenger_resources")
    .delete()
    .eq("id", id)
    .eq("page_id", pageId);
  if (error) throw new Error(error.message);
}

/** Capacity units used when checking/booking this resource. */
export function capacityUnitsFor(
  resource: BookableResource,
  byId: Map<string, BookableResource>,
): BookableResource[] {
  if (resource.linked_ids.length === 0) return [resource];
  const children = resource.linked_ids
    .map((id) => byId.get(id))
    .filter((r): r is BookableResource => Boolean(r?.active));
  return children.length > 0 ? children : [resource];
}
