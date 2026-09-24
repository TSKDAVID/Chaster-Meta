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
- Services may list linked staff/rooms — booking that service is free if ANY linked unit is free; the tool assigns one automatically.
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
