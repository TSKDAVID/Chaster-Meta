/**
 * AI tools live here (one file per tool under a group folder).
 * Each tool declares `moduleId` so it is only offered when that product module
 * is entitled + active (see `src/ai/modules/entitlements.ts`).
 *
 *   src/ai/tools/bookings/list-open-slots.ts  → moduleId: "bookings"
 *   src/ai/tools/media/…                     → moduleId: "media"
 */

export type { AiToolDefinition, ChasterTool } from "./types";
export {
  ALL_TOOLS,
  collectToolsForContext,
  dispatchTool,
  getTool,
} from "./registry";
export { BOOKING_TOOLS } from "./bookings";
export { RESOURCE_TOOLS } from "./resources";
export { MEDIA_TOOLS } from "./media";
export { HOURS_TOOLS } from "./hours";
export { CATALOG_TOOLS } from "./catalog";
