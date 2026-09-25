import { intentsMatch } from "@/ai/intents";
import { bookingsModule } from "@/ai/modules/bookings";
import { catalogModule } from "@/ai/modules/catalog";
import { hoursModule } from "@/ai/modules/hours";
import { inboxModule } from "@/ai/modules/inbox";
import { knowledgeModule } from "@/ai/modules/knowledge";
import { mediaModule } from "@/ai/modules/media";
import { resourcesModule } from "@/ai/modules/resources";
import {
  collectToolsForContext,
  dispatchTool,
} from "@/ai/tools/registry";
import { isModuleEntitled } from "./entitlements";
import type { ModuleContext, ModuleId, ChasterModule } from "./types";

/** Canonical module registry — add new modules here. */
export const ALL_MODULES: ChasterModule[] = [
  inboxModule,
  knowledgeModule,
  hoursModule,
  catalogModule,
  bookingsModule,
  resourcesModule,
  mediaModule,
];

const BY_ID = Object.fromEntries(
  ALL_MODULES.map((m) => [m.id, m]),
) as Record<ModuleId, ChasterModule>;

export function getModule(id: ModuleId): ChasterModule {
  return BY_ID[id];
}

/** Entitled + runtime-active modules for this AI turn. */
export function resolveActiveModules(ctx: ModuleContext): ChasterModule[] {
  return ALL_MODULES.filter((mod) => {
    if (!isModuleEntitled(ctx.entitlements, mod.id)) return false;
    if (mod.isActive && !mod.isActive(ctx)) return false;
    return true;
  });
}

export function collectSystemPromptSections(ctx: ModuleContext): string[] {
  const sections: string[] = [];
  for (const mod of resolveActiveModules(ctx)) {
    if (!intentsMatch(mod.intents, ctx.intents)) continue;
    const section = mod.systemPromptSection?.(ctx) ?? null;
    if (section?.trim()) sections.push(section.trim());
  }
  return sections;
}

/** Tools for active modules — delegated to `src/ai/tools`. */
export function collectAiTools(ctx: ModuleContext) {
  return collectToolsForContext(ctx);
}

/** Run a tool if its module is active — delegated to `src/ai/tools`. */
export async function dispatchAiTool(
  name: string,
  argsJson: string,
  ctx: ModuleContext,
): Promise<string> {
  return dispatchTool(name, argsJson, ctx);
}
