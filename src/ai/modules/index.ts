/**
 * Product modules for Chaster (subscription features).
 *
 * AI tools are separate: see `src/tools/` — each tool sets `moduleId` so it is
 * only offered when that module is entitled + active.
 */

export type { ModuleId, ChasterModule, ModuleContext } from "./types";
export { getEntitlements, isModuleEntitled } from "./entitlements";
export {
  ALL_MODULES,
  getModule,
  collectAiTools,
  collectSystemPromptSections,
  dispatchAiTool,
  resolveActiveModules,
} from "./registry";
