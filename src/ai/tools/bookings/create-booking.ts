import { createAiBooking } from "@/lib/booking-ops";
import type { ChasterTool } from "@/tools/types";
import { requireBookingSettings, strArg } from "@/tools/_shared";

export const createBookingTool: ChasterTool = {
  name: "create_booking",
  moduleId: "bookings",
  definition: {
    type: "function",
    function: {
      name: "create_booking",
      description:
        "Create a confirmed appointment. Only when the customer clearly wants to book.",
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
              "Optional resource UUID. Omit to assign any free unit automatically.",
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
    });
  },
};
