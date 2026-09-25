import { catalogPromptSection } from "@/lib/catalog";
import type { CatalogItem } from "@/lib/types";
import { selectRelevant, type WeightedField } from "@/ai/retrieval";
import type { ChasterModule, ModuleContext } from "@/ai/modules/types";

const INCLUDE_ALL_UP_TO = 15;
const TOP_K = 8;

export function catalogFields(item: CatalogItem): WeightedField[] {
  return [
    { text: item.name, weight: 3 },
    { text: item.variants.map((v) => v.name).join(" "), weight: 2 },
    { text: item.category, weight: 2 },
    { text: item.tags.join(" "), weight: 2 },
    { text: item.description, weight: 1 },
  ];
}

function photoPickLines(items: CatalogItem[]): string {
  return items
    .filter((i) => i.active && i.image_url)
    .map((i) => `- ${i.name} · has photo · id: ${i.id}`)
    .join("\n");
}

function catalogSystemPrompt(ctx: ModuleContext): string | null {
  const active = (ctx.catalogItems ?? []).filter((i) => i.active);
  if (active.length === 0) return null;
  const selection = selectRelevant(active, ctx.query ?? "", catalogFields, {
    includeAllUpTo: INCLUDE_ALL_UP_TO,
    topK: TOP_K,
  });

  const wantsPrices =
    !ctx.intents ||
    ctx.intents.includes("catalog") ||
    ctx.intents.some((i) =>
      ["availability", "booking_new", "booking_change", "other"].includes(i),
    );
  // Photo-only (or photo+faq without catalog): names + ids for send_photo, no prices/dates.
  if (!wantsPrices && ctx.intents?.includes("photo")) {
    const lines = photoPickLines(selection.items);
    if (!lines) return null;
    return `## Catalog photos
Use these to call send_photo (catalog_item_id or query=name). Do not mention prices or season dates unless the customer asked.
${lines}`;
  }

  return catalogPromptSection(selection.items, selection);
}

/**
 * Catalog / price list module — products & services with prices for AI.
 */
export const catalogModule: ChasterModule = {
  id: "catalog",
  label: "Catalog",
  description: "Priced products and services the AI can quote accurately.",
  intents: ["catalog", "photo", "other"],
  isActive: (ctx) => (ctx.catalogItems?.length ?? 0) > 0,
  systemPromptSection: catalogSystemPrompt,
};
