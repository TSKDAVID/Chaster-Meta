import type { ModuleContext } from "@/modules/types";

export function parseToolArgsJson(argsJson: string): Record<string, unknown> {
  try {
    return JSON.parse(argsJson || "{}") as Record<string, unknown>;
  } catch {
    throw new Error("Invalid tool arguments JSON");
  }
}

export function strArg(
  args: Record<string, unknown>,
  key: string,
): string | null {
  return typeof args[key] === "string" ? (args[key] as string).trim() : null;
}

/** Require booking settings enabled; throw a result object shape for JSON.stringify. */
export function requireBookingSettings(ctx: ModuleContext) {
  const settings = ctx.bookingSettings;
  if (!settings?.enabled) {
    throw {
      ok: false,
      message: "Online booking is currently off for this Page.",
    };
  }
  return settings;
}
