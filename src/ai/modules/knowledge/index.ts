import {
  formatKnowledgeLine,
  knowledgeFields,
  selectRelevant,
} from "@/ai/retrieval";
import type { ChasterModule, ModuleContext } from "@/ai/modules/types";

export const KNOWLEDGE_INCLUDE_ALL_UP_TO = 12;
const TOP_K = 6;

function knowledgePromptSection(ctx: ModuleContext): string | null {
  const knowledge = ctx.knowledge ?? [];
  if (knowledge.length === 0) return null;

  const selection = selectRelevant(knowledge, ctx.query ?? "", knowledgeFields, {
    includeAllUpTo: KNOWLEDGE_INCLUDE_ALL_UP_TO,
    topK: TOP_K,
  });
  const scope = selection.truncated
    ? `Showing the ${selection.items.length} most relevant of ${selection.total} entries. If none answers the question, call search_faq before saying you don't know.`
    : "These are all the business's FAQ entries.";

  return `## FAQ / knowledge base
${scope} Answer only from these facts (and the other sections); if the answer isn't here, say you'll check with the team instead of guessing.
${selection.items.map(formatKnowledgeLine).join("\n")}`;
}

/** FAQ / knowledge base module. AI tool: `search_faq` (only for large FAQ lists). */
export const knowledgeModule: ChasterModule = {
  id: "knowledge",
  label: "Knowledge",
  description: "FAQs and answers the AI uses when replying.",
  // Not on photo-only turns — prices/FAQs bleed into "just send the picture" replies.
  intents: [
    "faq",
    "catalog",
    "hours_location",
    "availability",
    "booking_new",
    "booking_change",
    "booking_cancel",
    "other",
  ],
  systemPromptSection: knowledgePromptSection,
};
