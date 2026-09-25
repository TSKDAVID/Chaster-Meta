import type { ChasterModule, ModuleContext } from "@/ai/modules/types";

function knowledgePromptSection(ctx: ModuleContext): string | null {
  const knowledge = ctx.knowledge ?? [];
  if (knowledge.length === 0) return null;

  const lines = knowledge.map((item, index) => {
    if (item.entry_type === "qa" && item.question) {
      return `${index + 1}. Q: ${item.question}\n   A: ${item.content}`;
    }
    return `${index + 1}. Info: ${item.content}`;
  });

  return `## FAQ / knowledge base\n${lines.join("\n")}`;
}

/**
 * FAQ / knowledge base module.
 * Prompt injection only for now; future tools: search_faqs, etc.
 */
export const knowledgeModule: ChasterModule = {
  id: "knowledge",
  label: "Knowledge",
  description: "FAQs and answers the AI uses when replying.",
  systemPromptSection: knowledgePromptSection,
};
