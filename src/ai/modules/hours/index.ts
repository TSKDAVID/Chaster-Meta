import { profilePromptSection } from "@/lib/page-profile";
import type { ChasterModule, ModuleContext } from "@/ai/modules/types";

function hoursPromptSection(ctx: ModuleContext): string | null {
  if (!ctx.pageProfile) return null;
  return profilePromptSection(ctx.pageProfile);
}

/**
 * Hours & place module — desk editor + AI facts for location / open hours.
 */
export const hoursModule: ChasterModule = {
  id: "hours",
  label: "Hours & place",
  description: "Business address, contact, and opening hours for AI answers.",
  intents: ["hours_location", "availability", "booking_new", "other"],
  isActive: (ctx) => Boolean(ctx.pageProfile),
  systemPromptSection: hoursPromptSection,
};
