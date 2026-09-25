/**
 * Chaster AI backend — the only place app code should import AI from.
 *
 *   brain.ts   load context → decide → reply (webhook auto-reply entry)
 *   groq.ts    LLM calls, system prompt, tool-call loop, chat summaries
 *   modules/   product modules: prompt sections + entitlements
 *   tools/     callable tools, one file per tool, grouped by module
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
  type BookingToolContext,
  type ChatTurn,
  type FaqKnowledgeItem,
} from "./groq";
