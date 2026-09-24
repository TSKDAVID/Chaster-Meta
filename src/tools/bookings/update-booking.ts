import { updateCustomerBooking } from "@/lib/booking-ops";
import type { ChasterTool } from "@/tools/types";
import { requireBookingSettings, strArg } from "@/tools/_shared";

export const updateBookingTool: ChasterTool = {
  name: "update_booking",
  moduleId: "bookings",
  definition: {
    type: "function",
    function: {
      name: "update_booking",
      description:
        "Reschedule and/or edit service/name/notes. Prefer this over creating a duplicate.",
      parameters: {
        type: "object",
        properties: {
          booking_id: { type: "string", description: "Booking UUID to edit" },
          date: {
            type: "string",
            description: "New date YYYY-MM-DD (for reschedule)",
          },
          time: {
            type: "string",
            description: "New start time HH:mm for hourly mode",
          },
          end_date: {
            type: "string",
            description: "New check-out date for multi_day mode",
          },
          service_label: { type: "string", description: "Updated service label" },
          customer_name: { type: "string", description: "Updated customer name" },
          notes: { type: "string", description: "Updated notes" },
          resource_id: {
            type: "string",
            description:
              "Optional: reassign to this resource (or keep existing if omitted on reschedule)",
          },
        },
        required: ["booking_id"],
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.bookingSettings?.enabled),
  async run(args, ctx) {
    const settings = requireBookingSettings(ctx);
    const customer_name = strArg(args, "customer_name");
    return updateCustomerBooking({
      pageId: ctx.pageId,
      peerId: ctx.peerId,
      settings,
      bookingId: strArg(args, "booking_id") || "",
      date: strArg(args, "date"),
      time: strArg(args, "time"),
      end_date: strArg(args, "end_date"),
      service_label:
        args.service_label === undefined
          ? undefined
          : strArg(args, "service_label"),
      customer_name:
        args.customer_name === undefined
          ? undefined
          : customer_name || ctx.customerName?.trim() || null,
      notes: args.notes === undefined ? undefined : strArg(args, "notes"),
      resourceId:
        args.resource_id === undefined ? undefined : strArg(args, "resource_id"),
    });
  },
};
