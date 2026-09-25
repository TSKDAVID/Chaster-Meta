import { bookingRulesForPrompt } from "@/lib/booking-ops";
import type { ModuleContext } from "@/modules/types";

export function bookingsPromptSection(ctx: ModuleContext): string | null {
  const settings = ctx.bookingSettings;
  if (!settings) return null;

  if (!settings.enabled) {
    return `## Appointment booking\nOnline booking is currently OFF. Do not claim you booked or changed anything; offer to take a message for the team.`;
  }

  let section = `## Appointment booking\n${bookingRulesForPrompt(settings)}`;
  if (ctx.customerName) {
    section += `\nCustomer name on this chat: ${ctx.customerName}`;
  }
  return section;
}
