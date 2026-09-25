import {
  availabilityLabel,
  formatCatalogPrice,
  formatCatalogStock,
  listCatalogItems,
} from "@/lib/catalog";
import type { ChasterTool } from "@/tools/types";
import { strArg } from "@/tools/_shared";

export const listCatalogTool: ChasterTool = {
  name: "list_catalog",
  moduleId: "catalog",
  definition: {
    type: "function",
    function: {
      name: "list_catalog",
      description:
        "List active catalog items with prices, variants, tags, stock, and availability. Use for menu, products, services, or price questions. If an item has image_url and the customer wants to see it, call send_photo with catalog_item_id.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "Optional filter matching name, category, description, or tags",
          },
        },
        required: [],
      },
    },
  },
  isAvailable: (ctx) => (ctx.catalogItems?.length ?? 0) > 0 || Boolean(ctx.pageId),
  async run(args, ctx) {
    const items =
      ctx.catalogItems && ctx.catalogItems.length > 0
        ? ctx.catalogItems.filter((i) => i.active)
        : await listCatalogItems(ctx.pageId);

    const q = (strArg(args, "query") || "").toLowerCase();
    const filtered = q
      ? items.filter(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            (i.category?.toLowerCase().includes(q) ?? false) ||
            (i.description?.toLowerCase().includes(q) ?? false) ||
            i.tags.some((t) => t.includes(q)),
        )
      : items;

    return {
      ok: true,
      count: filtered.length,
      items: filtered.slice(0, 30).map((i) => ({
        id: i.id,
        name: i.name,
        price_label: formatCatalogPrice(i),
        price: i.price,
        currency: i.currency,
        unit: i.unit,
        category: i.category,
        description: i.description,
        availability: i.availability,
        availability_label: availabilityLabel(i.availability),
        stock_unlimited: i.stock_unlimited,
        stock_qty: i.stock_unlimited ? null : i.stock_qty,
        stock_label: formatCatalogStock(i),
        tags: i.tags,
        variants: i.variants.map((v) => ({
          name: v.name,
          price: v.price,
          unit: v.unit,
        })),
        image_url: i.image_url,
      })),
    };
  },
};

export const CATALOG_TOOLS: ChasterTool[] = [listCatalogTool];
