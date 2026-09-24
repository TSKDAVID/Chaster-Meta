import type { ChasterModule } from "@/modules/types";

/**
 * Media / photo send for Messenger.
 * AI tools: `@/tools/media` (moduleId: "media").
 */
export const mediaModule: ChasterModule = {
  id: "media",
  label: "Media",
  description: "Upload and send photos (e.g. room shots) via Messenger.",
};
