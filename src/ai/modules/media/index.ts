import type { ChasterModule } from "@/ai/modules/types";

/**
 * Media / photo send for Messenger.
 * AI tools: `@/tools/media` (moduleId: "media").
 */
export const mediaModule: ChasterModule = {
  id: "media",
  label: "Media",
  description: "Upload and send photos (e.g. room shots) via Messenger.",
  isActive: (ctx) => Boolean(ctx.pageAccessToken),
  systemPromptSection: () =>
    `## Photos
When the customer asks for a photo (or a picture of a catalog item), call send_photo with catalog_item_id from list_catalog.
Never paste image links in your reply — Messenger must receive a real photo attachment.
After send_photo succeeds, reply briefly in text (e.g. what they are looking at).`,
};
