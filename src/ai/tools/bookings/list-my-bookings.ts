import { listCustomerBookings } from "@/lib/booking-ops";
import type { ChasterTool } from "@/ai/tools/types";
import { requireBookingSettings } from "@/ai/tools/_shared";

export const listMyBookingsTool: ChasterTool = {
  name: "list_my_bookings",
  moduleId: "bookings",
  intents: ["booking_new", "booking_change", "booking_cancel"],
  definition: {
    type: "function",
    function: {
      name: "list_my_bookings",
      description:
        "List this customer's bookings. Call before cancel/edit if you lack a booking id.",
      parameters: {
        type: "object",
        properties: {
          include_past: {
            type: "boolean",
            description: "Include past/cancelled bookings (default false)",
          },
        },
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.bookingSettings?.enabled),
  async run(args, ctx) {
    const settings = requireBookingSettings(ctx);
    return listCustomerBookings({
      pageId: ctx.pageId,
      peerId: ctx.peerId,
      settings,
      include_past: args.include_past === true,
    });
  },
};
