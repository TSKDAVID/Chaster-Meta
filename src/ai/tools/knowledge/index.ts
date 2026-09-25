import { KNOWLEDGE_INCLUDE_ALL_UP_TO } from "@/ai/modules/knowledge";
import { formatKnowledgeLine, knowledgeFields, rankByQuery } from "@/ai/retrieval";
import type { ChasterTool } from "@/ai/tools/types";
import { strArg } from "@/ai/tools/_shared";

const RESULT_LIMIT = 6;

export const searchFaqTool: ChasterTool = {
  name: "search_faq",
  moduleId: "knowledge",
  intents: [
    "faq",
    "hours_location",
    "catalog",
    "availability",
    "booking_new",
    "booking_change",
    "booking_cancel",
    "other",
  ],
  definition: {
    type: "function",
    function: {
      name: "search_faq",
      description:
        "Search the business FAQ / knowledge base. Use when the FAQ entries in your instructions don't answer the customer's question. Try the customer's words and a synonym if the first search finds nothing.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Words to search for" },
        },
        required: ["query"],
      },
    },
  },
  isAvailable: (ctx) => (ctx.knowledge?.length ?? 0) > KNOWLEDGE_INCLUDE_ALL_UP_TO,
  async run(args, ctx) {
    const query = strArg(args, "query") || "";
    const matches = rankByQuery(ctx.knowledge ?? [], query, knowledgeFields)
      .filter((r) => r.score > 0)
      .slice(0, RESULT_LIMIT)
      .map((r) => formatKnowledgeLine(r.item));

    if (matches.length === 0) {
      return {
        ok: true,
        count: 0,
        message: "Nothing in the FAQ matches. Don't guess — offer to check with the team.",
      };
    }
    return { ok: true, count: matches.length, entries: matches };
  },
};

export const KNOWLEDGE_TOOLS: ChasterTool[] = [searchFaqTool];
