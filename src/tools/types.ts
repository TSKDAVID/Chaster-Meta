import type { ModuleContext, ModuleId } from "@/modules/types";

/** OpenAI/Groq-compatible tool schema fragment. */
export type AiToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

/**
 * One AI-callable tool.
 * Lives under `src/tools/` and is linked to a product module via `moduleId`.
 * The LLM only sees tools whose module is entitled + active.
 */
export type ChasterTool = {
  /** Unique function name the model calls. */
  name: string;
  /** Product module that must be active for this tool to be offered. */
  moduleId: ModuleId;
  /** Schema sent to the LLM. */
  definition: AiToolDefinition;
  /**
   * Extra runtime gate (e.g. Page booking toggle).
   * Module entitlement/active is checked by the tools registry first.
   */
  isAvailable?: (ctx: ModuleContext) => boolean;
  /** Execute and return a JSON-serializable result (or already-stringified). */
  run: (
    args: Record<string, unknown>,
    ctx: ModuleContext,
  ) => Promise<unknown>;
};
