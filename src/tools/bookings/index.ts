import type { ChasterTool } from "@/tools/types";
import { cancelBookingTool } from "./cancel-booking";
import { checkAvailabilityTool } from "./check-availability";
import { completeBookingTool } from "./complete-booking";
import { createBookingTool } from "./create-booking";
import { getBookingTool } from "./get-booking";
import { listMyBookingsTool } from "./list-my-bookings";
import { listOpenSlotsTool } from "./list-open-slots";
import { updateBookingTool } from "./update-booking";

/** All AI tools that require the `bookings` module. */
export const BOOKING_TOOLS: ChasterTool[] = [
  listOpenSlotsTool,
  checkAvailabilityTool,
  listMyBookingsTool,
  getBookingTool,
  createBookingTool,
  updateBookingTool,
  cancelBookingTool,
  completeBookingTool,
];
