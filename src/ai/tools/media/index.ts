import { sendPageImageMessage } from "@/lib/meta";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { catalogFields } from "@/ai/modules/catalog";
import { matchRequestedPhotos } from "@/ai/photo-match";
import { rankByQuery } from "@/ai/retrieval";
import type { ChasterTool } from "@/ai/tools/types";
import { strArg } from "@/ai/tools/_shared";
import type { ModuleContext } from "@/ai/modules/types";
import type { CatalogItem } from "@/lib/types";

function itemsWithPhotos(ctx: ModuleContext): CatalogItem[] {
  return (ctx.catalogItems ?? []).filter((i) => i.active && i.image_url);
}

function matchCatalogPhoto(
  ctx: ModuleContext,
  query: string,
): { url: string; itemName?: string } | null {
  const q = query.trim();
  if (!q) return null;
  const item =
    matchRequestedPhotos(itemsWithPhotos(ctx), q)[0] ??
    rankByQuery(itemsWithPhotos(ctx), q, catalogFields).filter((r) => r.score > 0)[0]?.item;
  if (!item?.image_url) return null;
  return { url: item.image_url, itemName: item.name };
}

function resolveImageUrl(
  args: Record<string, unknown>,
  ctx: ModuleContext,
): { url: string; itemName?: string } | { error: string } {
  const catalogId = strArg(args, "catalog_item_id");
  const imageUrl = strArg(args, "image_url");
  const query = strArg(args, "query");

  if (catalogId) {
    const item = ctx.catalogItems?.find((i) => i.id === catalogId);
    if (!item) return { error: "Catalog item not found" };
    if (!item.image_url) {
      return { error: `“${item.name}” has no photo in the catalog` };
    }
    return { url: item.image_url, itemName: item.name };
  }

  if (!imageUrl) {
    if (query) {
      const matched = matchCatalogPhoto(ctx, query);
      if (matched) return matched;
      return { error: `No catalog photo matches “${query}”.` };
    }
    return {
      error: "Provide catalog_item_id, query (item name), or image_url from the catalog",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    return { error: "Invalid image URL" };
  }
  if (parsed.protocol !== "https:") {
    return { error: "Image URL must be https" };
  }

  const fromCatalog = ctx.catalogItems?.find((i) => i.image_url === imageUrl);
  const fromStorage =
    parsed.pathname.includes("/storage/v1/object/public/catalog/") ||
    parsed.pathname.includes("/storage/v1/object/sign/catalog/");

  if (!fromCatalog && !fromStorage) {
    return {
      error:
        "Only catalog photos can be sent. Pass the item's catalog_item_id (use search_catalog to find it).",
    };
  }

  return {
    url: imageUrl,
    itemName: fromCatalog?.name,
  };
}

export const sendPhotoTool: ChasterTool = {
  name: "send_photo",
  moduleId: "media",
  intents: ["photo"],
  definition: {
    type: "function",
    function: {
      name: "send_photo",
      description:
        "Send a catalog photo with this turn's reply. Call only when the latest message asks to see a picture (or retries). Call once per item they asked about. Prefer catalog_item_id; otherwise pass query with the item name. Never paste image links.",
      parameters: {
        type: "object",
        properties: {
          catalog_item_id: {
            type: "string",
            description: "Catalog item id (the item must be marked \"has photo\")",
          },
          query: {
            type: "string",
            description:
              "Item name to find a photo for, if you do not have catalog_item_id",
          },
          image_url: {
            type: "string",
            description:
              "Public https image URL from the catalog (only if you do not have catalog_item_id)",
          },
        },
        required: [],
      },
    },
  },
  isAvailable: (ctx) =>
    Boolean(ctx.pageAccessToken && ctx.pageId && ctx.peerId),
  async run(args, ctx) {
    const token = ctx.pageAccessToken?.trim();
    if (!token) {
      return { ok: false, message: "Page is not connected for sending media" };
    }

    const resolved = resolveImageUrl(args, ctx);
    if ("error" in resolved) {
      return { ok: false, message: resolved.error };
    }

    ctx.pendingPhotos ??= [];
    if (ctx.pendingPhotos.some((p) => p.url === resolved.url)) {
      return {
        ok: true,
        queued: true,
        item_name: resolved.itemName ?? null,
        note: "Same photo is already attached to this reply. Write one short line about what they are looking at. Do not say it was already sent.",
      };
    }
    ctx.pendingPhotos.push({ url: resolved.url, itemName: resolved.itemName });

    return {
      ok: true,
      queued: true,
      item_name: resolved.itemName ?? null,
      note: "The photo is attached to THIS reply, after your text. Write one short line about what they are looking at. Never say the photo was already sent.",
    };
  },
};

export async function deliverQueuedPhotos(
  ctx: ModuleContext,
  photos: Array<{ url: string; itemName?: string }>,
): Promise<{ sent: number; failed: number }> {
  const token = ctx.pageAccessToken?.trim();
  if (!token || photos.length === 0) return { sent: 0, failed: 0 };

  const supabase = getSupabaseAdmin();
  let sent = 0;
  let failed = 0;
  for (const photo of photos) {
    let result: Awaited<ReturnType<typeof sendPageImageMessage>>;
    try {
      result = await sendPageImageMessage(token, ctx.peerId, photo.url);
      sent++;
    } catch (err) {
      failed++;
      console.warn("[ai] photo send failed:", err instanceof Error ? err.message : err);
      continue;
    }
    const label = photo.itemName ? `📷 ${photo.itemName}` : "📷 Photo";
    await supabase.from("messenger_messages").upsert(
      {
        page_id: ctx.pageId,
        sender_id: ctx.pageId,
        recipient_id: ctx.peerId,
        mid: result.message_id ?? null,
        message_text: label,
        direction: "outgoing",
        platform: ctx.platform ?? "messenger",
        raw_payload: {
          source: "groq_send_photo",
          image_url: photo.url,
          item_name: photo.itemName ?? null,
          result,
        },
      },
      { onConflict: "mid" },
    );
  }
  return { sent, failed };
}

/** Queue photos of every item named in this message that the model didn't send. Returns how many were added. */
export function queueMatchingPhotos(ctx: ModuleContext, query: string): number {
  ctx.pendingPhotos ??= [];
  let added = 0;
  for (const item of matchRequestedPhotos(itemsWithPhotos(ctx), query)) {
    if (!item.image_url) continue;
    if (ctx.pendingPhotos.some((p) => p.url === item.image_url)) continue;
    ctx.pendingPhotos.push({ url: item.image_url, itemName: item.name });
    added++;
  }
  return added;
}

export const MEDIA_TOOLS: ChasterTool[] = [sendPhotoTool];
