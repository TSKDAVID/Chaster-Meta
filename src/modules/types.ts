import type { BookingSettings, ResourceSummary } from "@/lib/types";
import type { AccountEntitlements } from "./entitlements";

/** Stable ids — used in entitlements, registry, tools.moduleId, billing SKUs. */
export type ModuleId =
  | "inbox"
  | "knowledge"
  | "bookings"
  | "resources"
  | "media";

/** Context passed into module prompts + tool runners during an AI turn. */
export type ModuleContext = {
  pageId: string;
  peerId: string;
  customerName?: string | null;
  entitlements: AccountEntitlements;
  /** Present when bookings settings were loaded for this Page. */
  bookingSettings?: BookingSettings | null;
  /** Active resources when the resources module is used. */
  resources?: ResourceSummary[];
  knowledge?: Array<{
    entry_type: "qa" | "info";
    question: string | null;
    content: string;
  }>;
};

/**
 * Product module (subscription feature).
 * AI tools are NOT defined here — they live in `src/tools/` and point at a moduleId.
 */
export type ChasterModule = {
  id: ModuleId;
  label: string;
  description: string;
  /** Core modules are always part of the product shell. */
  core?: boolean;
  /**
   * Runtime gate beyond subscription (e.g. bookings settings loaded).
   * Entitlement is checked first by the registry.
   */
  isActive?: (ctx: ModuleContext) => boolean;
  /** Extra system-prompt section when this module is active. */
  systemPromptSection?: (ctx: ModuleContext) => string | null;
};
