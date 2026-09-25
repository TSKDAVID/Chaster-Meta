import { BOOKING_TOOLS } from "@/tools/bookings";
import { CATALOG_TOOLS } from "@/tools/catalog";
import { HOURS_TOOLS } from "@/tools/hours";
import { MEDIA_TOOLS } from "@/tools/media";
import { RESOURCE_TOOLS } from "@/tools/resources";
import type { AiToolDefinition, ChasterTool } from "@/tools/types";
import { parseToolArgsJson } from "@/tools/_shared";
import { isModuleEntitled } from "@/modules/entitlements";
import type { ModuleContext } from "@/modules/types";

/**
 * Canonical tool catalog.
 * Add new tool groups here when you create folders under `src/tools/`.
 */
export const ALL_TOOLS: ChasterTool[] = [
  ...BOOKING_TOOLS,
  ...RESOURCE_TOOLS,
  ...MEDIA_TOOLS,
  ...HOURS_TOOLS,
  ...CATALOG_TOOLS,
];

const BY_NAME = new Map(ALL_TOOLS.map((t) => [t.name, t]));

export function getTool(name: string): ChasterTool | undefined {
  return BY_NAME.get(name);
}

/** Tools the LLM may call for this turn (module entitled + tool gate). */
export function collectToolsForContext(ctx: ModuleContext): AiToolDefinition[] {
  const out: AiToolDefinition[] = [];
  const seen = new Set<string>();

  for (const tool of ALL_TOOLS) {
    if (!isModuleEntitled(ctx.entitlements, tool.moduleId)) continue;
    if (tool.isAvailable && !tool.isAvailable(ctx)) continue;
    if (seen.has(tool.name)) {
      console.warn(`[tools] duplicate tool name skipped: ${tool.name}`);
      continue;
    }
    seen.add(tool.name);
    out.push(tool.definition);
  }
  return out;
}

/** Run a tool by name if its module is entitled and the tool is available. */
export async function dispatchTool(
  name: string,
  argsJson: string,
  ctx: ModuleContext,
): Promise<string> {
  const tool = BY_NAME.get(name);
  if (!tool) {
    return JSON.stringify({ ok: false, message: `Unknown tool: ${name}` });
  }

  if (!isModuleEntitled(ctx.entitlements, tool.moduleId)) {
    return JSON.stringify({
      ok: false,
      message: `Tool "${name}" requires module "${tool.moduleId}" (not entitled).`,
    });
  }

  if (tool.isAvailable && !tool.isAvailable(ctx)) {
    return JSON.stringify({
      ok: false,
      message: `Tool "${name}" is not available right now.`,
    });
  }

  try {
    const args = parseToolArgsJson(argsJson);
    const result = await tool.run(args, ctx);
    return typeof result === "string" ? result : JSON.stringify(result);
  } catch (err) {
    if (err && typeof err === "object" && "ok" in err) {
      return JSON.stringify(err);
    }
    const message = err instanceof Error ? err.message : "Tool failed";
    return JSON.stringify({ ok: false, message });
  }
}
