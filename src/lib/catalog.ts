import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  CatalogAvailability,
  CatalogItem,
  CatalogVariant,
} from "@/lib/types";

export const CATALOG_TAG_SUGGESTIONS = [
  "vegan",
  "vegetarian",
  "kids",
  "outdoor",
  "gluten-free",
  "spicy",
  "popular",
  "new",
] as const;

export const AVAILABILITY_OPTIONS: Array<{
  id: CatalogAvailability;
  label: string;
  hint: string;
}> = [
  { id: "in_stock", label: "In stock", hint: "Ready to sell or serve" },
  { id: "seasonal", label: "Seasonal", hint: "Only some times of year" },
  { id: "ask", label: "Ask first", hint: "Confirm before promising" },
];

function trimOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function normalizePrice(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function normalizeAvailability(value: unknown): CatalogAvailability {
  if (value === "seasonal" || value === "ask" || value === "in_stock") return value;
  return "in_stock";
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const raw of value) {
    const t = String(raw).trim().toLowerCase();
    if (t && !out.includes(t) && t.length <= 40) out.push(t);
  }
  return out.slice(0, 16);
}

/** Works in Node and browsers, including non-secure LAN http origins. */
export function makeCatalogId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  if (c && typeof c.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    c.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
      "",
    );
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function newVariantId() {
  return makeCatalogId();
}

function normalizeStockQty(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

export function normalizeVariants(value: unknown): CatalogVariant[] {
  if (!Array.isArray(value)) return [];
  const out: CatalogVariant[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const name = trimOrNull(row.name);
    if (!name) continue;
    out.push({
      id: trimOrNull(row.id) || newVariantId(),
      name,
      price: normalizePrice(row.price),
      unit: trimOrNull(row.unit),
    });
    if (out.length >= 24) break;
  }
  return out;
}

function formatMoney(
  price: number | null,
  currency: string,
  unit?: string | null,
): string {
  if (price === null) return "Price on request";
  const amount = Number.isInteger(price) ? String(price) : price.toFixed(2);
  const u = unit ? ` / ${unit}` : "";
  return `${amount} ${currency}${u}`;
}

export function normalizeCatalogItem(
  row: Partial<CatalogItem> & { id: string; page_id: string; name: string },
): CatalogItem {
  return {
    id: row.id,
    page_id: row.page_id,
    name: row.name.trim(),
    description: trimOrNull(row.description),
    price: normalizePrice(row.price),
    currency: (trimOrNull(row.currency) || "GEL").toUpperCase(),
    unit: trimOrNull(row.unit),
    category: trimOrNull(row.category),
    image_url: trimOrNull(row.image_url),
    availability: normalizeAvailability(row.availability),
    tags: normalizeTags(row.tags),
    variants: normalizeVariants(row.variants),
    stock_unlimited: row.stock_unlimited !== false,
    stock_qty:
      row.stock_unlimited === false
        ? (normalizeStockQty(row.stock_qty) ?? 0)
        : null,
    active: row.active !== false,
    sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.updated_at ?? new Date().toISOString(),
  };
}

export function formatCatalogStock(item: CatalogItem): string {
  if (item.stock_unlimited) return "Unlimited";
  const qty = item.stock_qty ?? 0;
  if (qty <= 0) return "Out of stock";
  return `${qty} in stock`;
}

export function formatCatalogPrice(item: CatalogItem): string {
  if (item.variants.length > 0) {
    const priced = item.variants
      .map((v) => v.price)
      .filter((p): p is number => p !== null);
    if (priced.length === 0) return "Variants · price on request";
    const min = Math.min(...priced);
    const max = Math.max(...priced);
    if (min === max) return `from ${formatMoney(min, item.currency)}`;
    return `${formatMoney(min, item.currency)}–${formatMoney(max, item.currency)}`;
  }
  return formatMoney(item.price, item.currency, item.unit);
}

export function availabilityLabel(value: CatalogAvailability): string {
  return AVAILABILITY_OPTIONS.find((o) => o.id === value)?.label ?? value;
}

export async function listCatalogItems(
  pageId: string,
  opts?: { includeInactive?: boolean },
): Promise<CatalogItem[]> {
  const supabase = getSupabaseAdmin();
  let query = supabase
    .from("messenger_catalog_items")
    .select("*")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(200);

  if (!opts?.includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) =>
    normalizeCatalogItem(
      row as Partial<CatalogItem> & { id: string; page_id: string; name: string },
    ),
  );
}

export type CatalogItemInput = {
  pageId: string;
  name: string;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  unit?: string | null;
  category?: string | null;
  image_url?: string | null;
  availability?: CatalogAvailability;
  tags?: string[];
  variants?: CatalogVariant[];
  stock_unlimited?: boolean;
  stock_qty?: number | null;
  active?: boolean;
};

function stockFieldsFromInput(input: {
  stock_unlimited?: boolean;
  stock_qty?: number | null;
}) {
  const unlimited = input.stock_unlimited !== false;
  return {
    stock_unlimited: unlimited,
    stock_qty: unlimited ? null : (normalizeStockQty(input.stock_qty) ?? 0),
  };
}

function rowFromInput(input: CatalogItemInput, sortOrder: number) {
  return {
    page_id: input.pageId,
    name: input.name.trim(),
    description: trimOrNull(input.description),
    price: normalizePrice(input.price),
    currency: (trimOrNull(input.currency) || "GEL").toUpperCase(),
    unit: trimOrNull(input.unit),
    category: trimOrNull(input.category),
    image_url: trimOrNull(input.image_url),
    availability: normalizeAvailability(input.availability),
    tags: normalizeTags(input.tags),
    variants: normalizeVariants(input.variants),
    ...stockFieldsFromInput(input),
    active: input.active !== false,
    sort_order: sortOrder,
    updated_at: new Date().toISOString(),
  };
}

export async function createCatalogItem(
  input: CatalogItemInput,
): Promise<CatalogItem> {
  const name = input.name.trim();
  if (!name) throw new Error("Name is required");

  const supabase = getSupabaseAdmin();
  const { data: existing } = await supabase
    .from("messenger_catalog_items")
    .select("sort_order")
    .eq("page_id", input.pageId)
    .order("sort_order", { ascending: false })
    .limit(1);

  const sortOrder =
    typeof existing?.[0]?.sort_order === "number"
      ? (existing[0].sort_order as number) + 1
      : 0;

  const { data, error } = await supabase
    .from("messenger_catalog_items")
    .insert(rowFromInput({ ...input, name }, sortOrder))
    .select("*")
    .maybeSingle();

  if (error || !data) throw new Error(error?.message ?? "Failed to create item");
  return normalizeCatalogItem(
    data as Partial<CatalogItem> & { id: string; page_id: string; name: string },
  );
}

export async function updateCatalogItem(input: {
  id: string;
  pageId: string;
  name?: string;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  unit?: string | null;
  category?: string | null;
  image_url?: string | null;
  availability?: CatalogAvailability;
  tags?: string[];
  variants?: CatalogVariant[];
  stock_unlimited?: boolean;
  stock_qty?: number | null;
  active?: boolean;
  sort_order?: number;
}): Promise<CatalogItem> {
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new Error("Name is required");
    patch.name = name;
  }
  if (input.description !== undefined) {
    patch.description = trimOrNull(input.description);
  }
  if (input.price !== undefined) patch.price = normalizePrice(input.price);
  if (input.currency !== undefined) {
    patch.currency = (trimOrNull(input.currency) || "GEL").toUpperCase();
  }
  if (input.unit !== undefined) patch.unit = trimOrNull(input.unit);
  if (input.category !== undefined) patch.category = trimOrNull(input.category);
  if (input.image_url !== undefined) patch.image_url = trimOrNull(input.image_url);
  if (input.availability !== undefined) {
    patch.availability = normalizeAvailability(input.availability);
  }
  if (input.tags !== undefined) patch.tags = normalizeTags(input.tags);
  if (input.variants !== undefined) {
    patch.variants = normalizeVariants(input.variants);
  }
  if (
    input.stock_unlimited !== undefined ||
    input.stock_qty !== undefined
  ) {
    Object.assign(
      patch,
      stockFieldsFromInput({
        stock_unlimited: input.stock_unlimited,
        stock_qty: input.stock_qty,
      }),
    );
  }
  if (input.active !== undefined) patch.active = input.active;
  if (input.sort_order !== undefined) patch.sort_order = input.sort_order;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("messenger_catalog_items")
    .update(patch)
    .eq("id", input.id)
    .eq("page_id", input.pageId)
    .select("*")
    .maybeSingle();

  if (error || !data) throw new Error(error?.message ?? "Failed to update item");
  return normalizeCatalogItem(
    data as Partial<CatalogItem> & { id: string; page_id: string; name: string },
  );
}

export async function duplicateCatalogItem(
  id: string,
  pageId: string,
): Promise<CatalogItem> {
  const items = await listCatalogItems(pageId, { includeInactive: true });
  const source = items.find((i) => i.id === id);
  if (!source) throw new Error("Item not found");

  return createCatalogItem({
    pageId,
    name: `${source.name} (copy)`,
    description: source.description,
    price: source.price,
    currency: source.currency,
    unit: source.unit,
    category: source.category,
    image_url: source.image_url,
    availability: source.availability,
    tags: source.tags,
    variants: source.variants.map((v) => ({
      ...v,
      id: newVariantId(),
    })),
    stock_unlimited: source.stock_unlimited,
    stock_qty: source.stock_qty,
    active: source.active,
  });
}

export async function deleteCatalogItem(id: string, pageId: string) {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("messenger_catalog_items")
    .delete()
    .eq("id", id)
    .eq("page_id", pageId);
  if (error) throw new Error(error.message);
}

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function uploadCatalogImage(input: {
  pageId: string;
  bytes: ArrayBuffer;
  contentType: string;
  fileName: string;
}): Promise<string> {
  const type = (input.contentType || "image/jpeg").toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(type)) {
    throw new Error("Use a JPEG, PNG, WebP, or GIF image");
  }
  if (input.bytes.byteLength > 5 * 1024 * 1024) {
    throw new Error("Image must be under 5 MB");
  }

  const ext =
    type === "image/png"
      ? "png"
      : type === "image/webp"
        ? "webp"
        : type === "image/gif"
          ? "gif"
          : "jpg";
  const path = `${input.pageId}/${makeCatalogId()}.${ext}`;
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage.from("catalog").upload(path, input.bytes, {
    contentType: type,
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("catalog").getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("Failed to resolve image URL");
  return data.publicUrl;
}

const DESCRIPTION_LIMIT = 160;

/** One compact line per item for the AI prompt / search results. */
export function formatCatalogLine(item: CatalogItem): string {
  const bits = [`- ${item.name} — ${formatCatalogPrice(item)}`];
  if (item.variants.length) {
    bits.push(
      `(options: ${item.variants
        .map((v) => `${v.name} ${formatMoney(v.price, item.currency, v.unit)}`)
        .join("; ")})`,
    );
  }
  bits.push(`· ${availabilityLabel(item.availability)} · stock: ${formatCatalogStock(item)}`);
  if (item.category) bits.push(`· ${item.category}`);
  if (item.tags.length) bits.push(`· tags: ${item.tags.join(", ")}`);
  if (item.image_url) bits.push("· has photo");
  bits.push(`· id: ${item.id}`);
  let line = bits.join(" ");
  if (item.description) {
    const desc =
      item.description.length > DESCRIPTION_LIMIT
        ? `${item.description.slice(0, DESCRIPTION_LIMIT).trimEnd()}…`
        : item.description;
    line += `\n  ${desc}`;
  }
  return line;
}

export function catalogPromptSection(
  items: CatalogItem[],
  opts: { total?: number; truncated?: boolean } = {},
): string | null {
  const active = items.filter((i) => i.active);
  if (active.length === 0) return null;

  const scope = opts.truncated
    ? `Showing the ${active.length} most relevant of ${opts.total ?? active.length} items. If the customer asks about something not listed, call search_catalog before saying you don't have it.`
    : "This is the full catalog.";

  return `## Catalog / price list
${scope}
Quote prices exactly as written here, in the same currency. Never invent prices or items.
Availability: In stock = available, Seasonal = only in season, Ask first = confirm with the team before promising.
Stock "Unlimited" (typical for services) means no quantity limit; a number means units left; "Out of stock" means say so honestly.
${active.map(formatCatalogLine).join("\n")}`;
}
