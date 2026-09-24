import { sendPageImageMessage } from "@/lib/meta";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { ChasterTool } from "@/tools/types";
import { strArg } from "@/tools/_shared";
import type { ModuleContext } from "@/modules/types";

function resolveImageUrl(
  args: Record<string, unknown>,
  ctx: ModuleContext,
): { url: string; itemName?: string } | { error: string } {
  const catalogId = strArg(args, "catalog_item_id");
  const imageUrl = strArg(args, "image_url");

  if (catalogId) {
    const item = ctx.catalogItems?.find((i) => i.id === catalogId);
    if (!item) return { error: "Catalog item not found" };
    if (!item.image_url) {
      return { error: `“${item.name}” has no photo in the catalog` };
    }
    return { url: item.image_url, itemName: item.name };
  }

  if (!imageUrl) {
    return {
      error: "Provide catalog_item_id or image_url from the catalog",
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
        "Only catalog photos can be sent. Use list_catalog and pass catalog_item_id or that item’s image_url.",
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
  definition: {
    type: "function",
    function: {
      name: "send_photo",
      description:
        "Send a catalog photo as a real Messenger image (not a link). Use when the customer asks to see a product/service photo. Prefer catalog_item_id from list_catalog.",
      parameters: {
        type: "object",
        properties: {
          catalog_item_id: {
            type: "string",
            description: "Catalog item id that has an image_url",
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

    const result = await sendPageImageMessage(
      token,
      ctx.peerId,
      resolved.url,
    );

    const supabase = getSupabaseAdmin();
    const label = resolved.itemName
      ? `📷 ${resolved.itemName}`
      : "📷 Photo";

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
          image_url: resolved.url,
          item_name: resolved.itemName ?? null,
          result,
        },
      },
      { onConflict: "mid", ignoreDuplicates: true },
    );

    return {
      ok: true,
      sent: true,
      message_id: result.message_id ?? null,
      item_name: resolved.itemName ?? null,
      note: "Photo delivered in chat. Follow up with a short text reply — do not paste the URL.",
    };
  },
};

export const MEDIA_TOOLS: ChasterTool[] = [sendPhotoTool];
