import { checkAvailability } from "@/lib/booking-ops";
import type { ChasterTool } from "@/ai/tools/types";
import { requireBookingSettings, strArg } from "@/ai/tools/_shared";

export const checkAvailabilityTool: ChasterTool = {
  name: "check_availability",
  moduleId: "bookings",
  intents: ["availability", "booking_new", "booking_change"],
  definition: {
    type: "function",
    function: {
      name: "check_availability",
      description:
        "Check whether a specific date/time (or day/range) is free on the ledger.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date as YYYY-MM-DD in the business timezone",
          },
          time: {
            type: "string",
            description: "Start time HH:mm for hourly mode (e.g. 15:00)",
          },
          end_date: {
            type: "string",
            description: "Check-out date YYYY-MM-DD for multi_day mode",
          },
          exclude_booking_id: {
            type: "string",
            description: "Ignore this booking when checking (for reschedule)",
          },
          resource_id: {
            type: "string",
            description:
              "Optional resource UUID. Omit to check if any unit is free.",
          },
        },
        required: ["date"],
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.bookingSettings?.enabled),
  async run(args, ctx) {
    const settings = requireBookingSettings(ctx);
    return checkAvailability({
      pageId: ctx.pageId,
      settings,
      date: strArg(args, "date") || "",
      time: strArg(args, "time"),
      end_date: strArg(args, "end_date"),
      excludeBookingId: strArg(args, "exclude_booking_id"),
      resourceId: strArg(args, "resource_id"),
    });
  },
};
