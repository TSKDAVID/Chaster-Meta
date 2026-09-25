import type { ChasterModule } from "@/ai/modules/types";

/**
 * Media / photo send for Messenger.
 * AI tools: `@/tools/media` (moduleId: "media").
 */
export const mediaModule: ChasterModule = {
  id: "media",
  label: "Media",
  description: "Upload and send photos (e.g. room shots) via Messenger.",
  intents: ["photo"],
  isActive: (ctx) => Boolean(ctx.pageAccessToken),
  systemPromptSection: () =>
    `## Photos
Call send_photo only when the latest message asks to see a picture (or retries a failed photo). Do not send photos for booking/FAQ/other turns just because photos were sent earlier.
When sending: call send_photo once per item asked about, with catalog_item_id or query=item name. Every item marked "has photo" can be sent — do not say you have no photo without calling the tool first.
Caption with a short line about what they are looking at — no prices or dates unless they also asked.
Never paste image links or write [send_photo] as text. Never say the photo was already sent.`,
};
