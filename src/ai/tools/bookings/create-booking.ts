import { createAiBooking } from "@/lib/booking-ops";
import type { ChasterTool } from "@/ai/tools/types";
import { requireBookingSettings, strArg } from "@/ai/tools/_shared";

export const createBookingTool: ChasterTool = {
  name: "create_booking",
  moduleId: "bookings",
  intents: ["booking_new"],
  definition: {
    type: "function",
    function: {
      name: "create_booking",
      description:
        "Create a NEW confirmed appointment, only after the customer agreed to a specific date, time and service. To change an existing booking use update_booking instead.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: "Date as YYYY-MM-DD in the business timezone",
          },
          time: {
            type: "string",
            description: "Start time HH:mm for hourly mode",
          },
          end_date: {
            type: "string",
            description: "Check-out date YYYY-MM-DD for multi_day mode",
          },
          service_label: {
            type: "string",
            description: "What they want (e.g. haircut)",
          },
          customer_name: {
            type: "string",
            description: "Customer name if known",
          },
          notes: {
            type: "string",
            description: "Optional notes (location preference, etc.)",
          },
          resource_id: {
            type: "string",
            description:
              "Optional resource id (e.g. a specific staff member). Omit to assign any free unit automatically.",
          },
          additional: {
            type: "boolean",
            description:
              "true only when the customer explicitly wants an extra appointment besides one they already have for the same service",
          },
        },
        required: ["date"],
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.bookingSettings?.enabled),
  async run(args, ctx) {
    const settings = requireBookingSettings(ctx);
    return createAiBooking({
      pageId: ctx.pageId,
      peerId: ctx.peerId,
      settings,
      date: strArg(args, "date") || "",
      time: strArg(args, "time"),
      end_date: strArg(args, "end_date"),
      service_label: strArg(args, "service_label"),
      customer_name: strArg(args, "customer_name") || ctx.customerName?.trim() || null,
      notes: strArg(args, "notes"),
      resourceId: strArg(args, "resource_id"),
      additional: args.additional === true || args.additional === "true",
    });
  },
};
