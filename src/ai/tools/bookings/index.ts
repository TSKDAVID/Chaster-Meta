import type { ChasterTool } from "@/ai/tools/types";
import { cancelBookingTool } from "./cancel-booking";
import { checkAvailabilityTool } from "./check-availability";
import { createBookingTool } from "./create-booking";
import { getBookingTool } from "./get-booking";
import { listMyBookingsTool } from "./list-my-bookings";
import { listOpenSlotsTool } from "./list-open-slots";
import { updateBookingTool } from "./update-booking";

/**
 * All AI tools that require the `bookings` module.
 * `complete_booking` stays out: marking visits done is an operator action.
 */
export const BOOKING_TOOLS: ChasterTool[] = [
  listOpenSlotsTool,
  checkAvailabilityTool,
  listMyBookingsTool,
  getBookingTool,
  createBookingTool,
  updateBookingTool,
  cancelBookingTool,
];
