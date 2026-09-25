import { cancelCustomerBooking } from "@/lib/booking-ops";
import type { ChasterTool } from "@/ai/tools/types";
import { requireBookingSettings, strArg } from "@/ai/tools/_shared";

export const cancelBookingTool: ChasterTool = {
  name: "cancel_booking",
  moduleId: "bookings",
  definition: {
    type: "function",
    function: {
      name: "cancel_booking",
      description: "Cancel one of this customer's bookings by id.",
      parameters: {
        type: "object",
        properties: {
          booking_id: { type: "string", description: "Booking UUID to cancel" },
        },
        required: ["booking_id"],
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.bookingSettings?.enabled),
  async run(args, ctx) {
    const settings = requireBookingSettings(ctx);
    return cancelCustomerBooking({
      pageId: ctx.pageId,
      peerId: ctx.peerId,
      settings,
      bookingId: strArg(args, "booking_id") || "",
    });
  },
};
