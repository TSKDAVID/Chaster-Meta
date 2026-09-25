import { completeCustomerBooking } from "@/lib/booking-ops";
import type { ChasterTool } from "@/ai/tools/types";
import { requireBookingSettings, strArg } from "@/ai/tools/_shared";

export const completeBookingTool: ChasterTool = {
  name: "complete_booking",
  moduleId: "bookings",
  definition: {
    type: "function",
    function: {
      name: "complete_booking",
      description: "Mark a booking as completed/done.",
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
    return completeCustomerBooking({
      pageId: ctx.pageId,
      peerId: ctx.peerId,
      settings,
      bookingId: strArg(args, "booking_id") || "",
    });
  },
};
