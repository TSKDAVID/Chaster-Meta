import { BOOKING_INTENTS } from "@/ai/intents";
import type { ChasterModule } from "@/ai/modules/types";
import { bookingsPromptSection } from "./prompt";

/**
 * Appointment ledger module — UI + prompt rules.
 * AI tools live in `@/tools/bookings` and are linked via `moduleId: "bookings"`.
 */
export const bookingsModule: ChasterModule = {
  id: "bookings",
  label: "Bookings",
  description: "Appointment availability, ledger, and AI booking tools.",
  intents: BOOKING_INTENTS,
  isActive: (ctx) => Boolean(ctx.bookingSettings),
  systemPromptSection: bookingsPromptSection,
};
