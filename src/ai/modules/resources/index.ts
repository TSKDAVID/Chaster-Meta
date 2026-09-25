import { BOOKING_INTENTS } from "@/ai/intents";
import { formatOpenDaysLabel } from "@/lib/page-profile";
import type { BookingSettings, ResourceSummary } from "@/lib/types";
import type { ChasterModule, ModuleContext } from "@/ai/modules/types";

function hoursLabel(r: ResourceSummary, settings: BookingSettings | null | undefined) {
  const open = r.open_time || settings?.open_time;
  const close = r.close_time || settings?.close_time;
  const days = r.open_days && r.open_days.length > 0 ? r.open_days : settings?.open_days;
  if (!open || !close || !days) return null;
  const inherited = !r.open_time && !r.close_time && !(r.open_days && r.open_days.length > 0);
  return `${formatOpenDaysLabel(days)} ${open}–${close}${inherited ? " (Page hours)" : ""}`;
}

function resourcesPromptSection(ctx: ModuleContext): string | null {
  const resources = ctx.resources ?? [];
  if (resources.length === 0) return null;

  const byId = new Map(resources.map((r) => [r.id, r]));
  const lines = resources.map((r) => {
    const hours = hoursLabel(r, ctx.bookingSettings);
    let line = `- ${r.name} (${r.kind}, id: ${r.id})`;
    if (r.kind === "service" && r.linked_ids?.length) {
      const staff = r.linked_ids
        .map((id) => byId.get(id))
        .filter((s): s is ResourceSummary => Boolean(s))
        .map((s) => {
          const h = hoursLabel(s, ctx.bookingSettings);
          return h ? `${s.name} [${h}]` : s.name;
        });
      line += staff.length ? ` — done by: ${staff.join("; ")}` : "";
    } else if (hours) {
      line += ` — works ${hours}`;
    }
    return line;
  });

  return `## Staff, services & rooms
${lines.join("\n")}
Rules:
- A service can only be booked when one of its staff works that day and time. Check the staff hours above before suggesting a day; if a day/time is outside everyone's hours, say so and suggest when they do work.
- If the customer names a person, pass that person's id as resource_id and the service in service_label. Otherwise omit resource_id so any free staff is assigned.
- When a tool result includes resource_name / assigned_resource_name, tell the customer who they are booked with.`;
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
  intents: BOOKING_INTENTS,
  isActive: (ctx) =>
    Boolean(ctx.bookingSettings) && (ctx.resources?.length ?? 0) > 0,
  systemPromptSection: resourcesPromptSection,
};
