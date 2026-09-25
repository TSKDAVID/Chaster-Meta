import { loadActiveResources, toResourceSummary } from "@/lib/resource-ops";
import type { ChasterTool } from "@/ai/tools/types";

export const listResourcesTool: ChasterTool = {
  name: "list_resources",
  moduleId: "resources",
  definition: {
    type: "function",
    function: {
      name: "list_resources",
      description:
        "List active bookable resources (staff, rooms, etc.) for this Page. Use before pinning a specific person/unit.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.bookingSettings?.enabled),
  async run(_args, ctx) {
    const rows = await loadActiveResources(ctx.pageId);
    const resources = rows.map(toResourceSummary);
    return {
      ok: true,
      message:
        resources.length === 0
          ? "No active resources — bookings use the shared Page calendar."
          : `Found ${resources.length} resource(s). Omit resource_id on booking tools to assign any free unit.`,
      resources,
    };
  },
};
