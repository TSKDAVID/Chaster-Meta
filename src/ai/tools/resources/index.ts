import type { ChasterTool } from "@/tools/types";
import { listResourcesTool } from "./list-resources";

/** AI tools that require the `resources` module. */
export const RESOURCE_TOOLS: ChasterTool[] = [listResourcesTool];
