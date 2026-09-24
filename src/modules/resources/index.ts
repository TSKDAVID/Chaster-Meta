import type { ChasterModule, ModuleContext } from "@/modules/types";

function resourcesPromptSection(ctx: ModuleContext): string | null {
  const resources = ctx.resources ?? [];
  if (resources.length === 0) return null;

  const lines = resources.map((r, i) => {
    const links =
      r.linked_ids && r.linked_ids.length > 0
        ? ` → linked: ${r.linked_ids.join(", ")}`
        : "";
    return `${i + 1}. ${r.name} (${r.kind}) — id: ${r.id}${links}`;
  });

  return `## Bookable resources
Active units for this Page:
${lines.join("\n")}

Assignment rules:
- Default: omit resource_id so any free unit is used (most common).
- A service's hours are calculated from its linked staff: earliest start, latest finish, and all days on which at least one linked person works.
- Booking a service assigns one linked staff member who is both working and free. A booking for any service makes that person unavailable for every other service at the same time.
- Rooms and equipment never substitute for staff. Their service associations only describe what can happen there.
- Only pass resource_id when the customer asks for a specific service/person/room — use list_resources or the ids above.
- When create_booking succeeds, mention resource_name and assigned_resource_name if present.`;
}

/**
 * Bookable units (staff, rooms, services, equipment).
 * AI tools: `@/tools/resources`. Enhances Bookings when ≥1 active resource exists.
 */
export const resourcesModule: ChasterModule = {
  id: "resources",
  label: "Resources",
  description:
    "Named bookable units (staff, rooms, services) with links and any/specific assignment.",
  isActive: (ctx) =>
    Boolean(ctx.bookingSettings) && (ctx.resources?.length ?? 0) > 0,
  systemPromptSection: resourcesPromptSection,
};
