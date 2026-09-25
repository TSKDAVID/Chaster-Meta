import { getCustomerBooking } from "@/lib/booking-ops";
import type { ChasterTool } from "@/tools/types";
import { requireBookingSettings, strArg } from "@/tools/_shared";

export const getBookingTool: ChasterTool = {
  name: "get_booking",
  moduleId: "bookings",
  definition: {
    type: "function",
    function: {
      name: "get_booking",
      description: "Get one booking by id for this customer.",
      parameters: {
        type: "object",
        properties: {
          booking_id: { type: "string", description: "Booking UUID" },
        },
        required: ["booking_id"],
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.bookingSettings?.enabled),
  async run(args, ctx) {
    const settings = requireBookingSettings(ctx);
    return getCustomerBooking({
      pageId: ctx.pageId,
      peerId: ctx.peerId,
      settings,
      bookingId: strArg(args, "booking_id") || "",
    });
  },
};
