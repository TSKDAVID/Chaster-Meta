import { catalogPromptSection } from "@/lib/catalog";
import type { ChasterModule, ModuleContext } from "@/modules/types";

function catalogSystemPrompt(ctx: ModuleContext): string | null {
  return catalogPromptSection(ctx.catalogItems ?? []);
}

/**
 * Catalog / price list module — products & services with prices for AI.
 */
export const catalogModule: ChasterModule = {
  id: "catalog",
  label: "Catalog",
  description: "Priced products and services the AI can quote accurately.",
  isActive: (ctx) => (ctx.catalogItems?.length ?? 0) > 0,
  systemPromptSection: catalogSystemPrompt,
};
