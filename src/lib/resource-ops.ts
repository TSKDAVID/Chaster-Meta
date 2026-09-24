import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  normalizeOpenDays,
  normalizeOptionalOpenDays,
} from "@/lib/bookings";
export {
  effectiveWindowForPair,
} from "@/lib/resource-hours";
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
  const kind = normalizeKind(row.kind);
  return {
    id: row.id,
    page_id: row.page_id,
    name: row.name.trim(),
    kind,
    active: row.active !== false,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    notes: row.notes?.trim() || null,
    open_time: row.open_time?.trim() || null,
    close_time: row.close_time?.trim() || null,
    open_days: normalizeOptionalOpenDays(row.open_days),
    linked_ids: linkedIds,
    serviceable:
      typeof row.serviceable === "boolean" ? row.serviceable : kind === "staff",
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
    serviceable: r.serviceable || undefined,
  };
}

/** Only these units can be linked under a service as capacity. */
export function canProvideService(r: BookableResource): boolean {
  if (r.kind === "service") return false;
  if (r.kind === "staff") return r.serviceable !== false;
  return r.serviceable === true;
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
  serviceable?: boolean;
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

  const serviceableDefault =
    typeof input.serviceable === "boolean"
      ? input.serviceable
      : normalizeKind(input.kind) === "staff";
  let insertPayload: Record<string, unknown> = {
    page_id: input.pageId,
    name,
    kind: normalizeKind(input.kind),
    notes: input.notes?.trim() || null,
    open_time: input.open_time?.trim() || null,
    close_time: input.close_time?.trim() || null,
    open_days: normalizeOptionalOpenDays(input.open_days),
    sort_order: sortOrder,
    active: input.active !== false,
    serviceable: serviceableDefault,
    updated_at: new Date().toISOString(),
  };

  let { data, error } = await supabase
    .from("messenger_resources")
    .insert(insertPayload)
    .select("*")
    .maybeSingle();

  if (error && error.message.includes("serviceable")) {
    // Migration schema-resource-serviceable.sql not applied yet — retry
    // without the new column so old DBs keep working.
    const { serviceable: _omit, ...legacyPayload } = insertPayload;
    const retry = await supabase
      .from("messenger_resources")
      .insert(legacyPayload)
      .select("*")
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

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
  serviceable?: boolean;
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
  if (input.serviceable !== undefined) patch.serviceable = input.serviceable;

  const supabase = getSupabaseAdmin();
  let { data, error } = await supabase
    .from("messenger_resources")
    .update(patch)
    .eq("id", input.id)
    .eq("page_id", input.pageId)
    .select("*")
    .maybeSingle();

  if (error && error.message.includes("serviceable")) {
    const { serviceable: _omit, ...legacyPatch } = patch;
    const retry = await supabase
      .from("messenger_resources")
      .update(legacyPatch)
      .eq("id", input.id)
      .eq("page_id", input.pageId)
      .select("*")
      .maybeSingle();
    data = retry.data;
    error = retry.error;
  }

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
    const byId = new Map(siblings.map((r) => [r.id, r]));
    for (const id of unique) {
      const child = byId.get(id);
      if (!child) {
        throw new Error(`Linked resource not found: ${id}`);
      }
      if (parent.kind === "service") {
        if (!canProvideService(child)) {
          throw new Error(
            `${child.name} isn't enabled for services. Update its service settings first.`,
          );
        }
        if (child.kind === "service") {
          throw new Error(
            `${child.name} is a service and can't be linked under another service.`,
          );
        }
      } else if (
        parent.kind === "room" ||
        parent.kind === "equipment" ||
        parent.kind === "other"
      ) {
        // Room-centric membership: rooms hold staff who work there.
        // Services are connected from the room editor by updating the
        // SERVICE side, never stored here — so only staff allowed.
        if (child.kind !== "staff") {
          throw new Error(
            `A ${parent.kind} can only hold team members — connect services from the service side (or the room editor's Services list).`,
          );
        }
      } else if (parent.kind === "staff") {
        throw new Error(
          `Team members don't hold links — connect them from Services & rooms or a room instead.`,
        );
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
  // Only services expand links into providers. Room → staff links are
  // membership ("who works here"), not booking alternatives — booking a
  // room books the room itself.
  if (resource.kind !== "service" || resource.linked_ids.length === 0) {
    return [resource];
  }
  const linkedStaff = resource.linked_ids
    .map((id) => byId.get(id))
    .filter(
      (linked): linked is BookableResource => linked?.kind === "staff",
    );
  if (linkedStaff.length === 0) return [resource];
  return linkedStaff.filter(
    (staff) => staff.active && canProvideService(staff),
  );
}

/** Human summary of the effective window, for desk + empty states. */
export function describeEffectiveWindow(
  window: { open_time: string; close_time: string; open_days: WeekdayKey[] } | null,
): string | null {
  if (!window) return null;
  return `${window.open_time}–${window.close_time} · ${window.open_days.join(", ")}`;
}
