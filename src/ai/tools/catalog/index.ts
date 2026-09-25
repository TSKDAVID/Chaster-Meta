import { formatCatalogLine, listCatalogItems } from "@/lib/catalog";
import { rankByQuery } from "@/ai/retrieval";
import { catalogFields } from "@/ai/modules/catalog";
import type { ChasterTool } from "@/ai/tools/types";
import { strArg } from "@/ai/tools/_shared";

const RESULT_LIMIT = 10;

export const searchCatalogTool: ChasterTool = {
  name: "search_catalog",
  moduleId: "catalog",
  intents: ["catalog"],
  definition: {
    type: "function",
    function: {
      name: "search_catalog",
      description:
        "Search the catalog (products, services, prices, options, stock). Use when the item the customer asks about is not in the catalog section of your instructions. Try the customer's words and an English/Georgian synonym if the first search finds nothing.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Words to match against item names, categories, tags, descriptions",
          },
        },
        required: ["query"],
      },
    },
  },
  isAvailable: (ctx) => (ctx.catalogItems?.length ?? 0) > 0,
  async run(args, ctx) {
    const items =
      ctx.catalogItems && ctx.catalogItems.length > 0
        ? ctx.catalogItems.filter((i) => i.active)
        : await listCatalogItems(ctx.pageId);

    const query = strArg(args, "query") || "";
    const matches = rankByQuery(items, query, catalogFields)
      .filter((r) => r.score > 0)
      .slice(0, RESULT_LIMIT)
      .map((r) => r.item);

    if (matches.length === 0) {
      return {
        ok: true,
        count: 0,
        message: "No catalog item matches. Do not invent one; say it isn't listed or offer to check with the team.",
      };
    }

    return {
      ok: true,
      count: matches.length,
      items: matches.map(formatCatalogLine),
    };
  },
};

export const CATALOG_TOOLS: ChasterTool[] = [searchCatalogTool];
