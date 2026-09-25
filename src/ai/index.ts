/**
 * Chaster AI backend — the only place app code should import AI from.
 *
 *   brain.ts      load → route → assemble → answer → clean → send → remember
 *   router.ts     small-model intent/language/entity classification
 *   context.ts    system prompt: identity, clock, rules, memory, sections
 *   retrieval.ts  lexical ranking of FAQ / catalog entries
 *   memory.ts     running summary + working booking state
 *   format.ts     Messenger plain-text cleanup
 *   groq.ts       LLM calls, tool-call loop, chat summaries
 *   modules/      product modules: prompt sections + entitlements
 *   tools/        callable tools, one file per tool, grouped by module
 */

export {
  decideAndGenerate,
  loadBrainContext,
  runAutoReply,
  type BrainContext,
  type BrainDecision,
} from "./brain";
export {
  generateMessengerReply,
  isAiAutoReplyEnabled,
  summarizeChatAndSuggestFaqs,
  type ChatTurn,
  type FaqKnowledgeItem,
} from "./groq";
