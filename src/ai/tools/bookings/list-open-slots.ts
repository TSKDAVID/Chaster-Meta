import { listOpenSlots } from "@/lib/booking-ops";
import type { ChasterTool } from "@/ai/tools/types";
import { requireBookingSettings, strArg } from "@/ai/tools/_shared";

export const listOpenSlotsTool: ChasterTool = {
  name: "list_open_slots",
  moduleId: "bookings",
  intents: ["availability", "booking_new", "booking_change"],
  definition: {
    type: "function",
    function: {
      name: "list_open_slots",
      description: "List free appointment times on a given date.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date as YYYY-MM-DD in the business timezone",
          },
          exclude_booking_id: {
            type: "string",
            description:
              "When rescheduling, pass the booking id so its current slot counts as free",
          },
          resource_id: {
            type: "string",
            description:
              "Optional resource UUID. Omit to show times where any unit is free.",
          },
        },
        required: ["date"],
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.bookingSettings?.enabled),
  async run(args, ctx) {
    const settings = requireBookingSettings(ctx);
    return listOpenSlots({
      pageId: ctx.pageId,
      settings,
      date: strArg(args, "date") || "",
      excludeBookingId: strArg(args, "exclude_booking_id"),
      resourceId: strArg(args, "resource_id"),
    });
  },
};
