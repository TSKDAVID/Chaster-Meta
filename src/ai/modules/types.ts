import type { Intent } from "@/ai/intents";
import type {
  BookingSettings,
  CatalogItem,
  MessagePlatform,
  PageProfile,
  ResourceSummary,
} from "@/lib/types";
import type { AccountEntitlements } from "./entitlements";

/** Stable ids — used in entitlements, registry, tools.moduleId, billing SKUs. */
export type ModuleId =
  | "inbox"
  | "knowledge"
  | "bookings"
  | "resources"
  | "media"
  | "hours"
  | "catalog";

/** Context passed into module prompts + tool runners during an AI turn. */
export type ModuleContext = {
  pageId: string;
  peerId: string;
  customerName?: string | null;
  entitlements: AccountEntitlements;
  /** Page token for outbound Graph calls (e.g. send_photo). */
  pageAccessToken?: string | null;
  platform?: MessagePlatform;
  /** Present when bookings settings were loaded for this Page. */
  bookingSettings?: BookingSettings | null;
  /** Active resources when the resources module is used. */
  resources?: ResourceSummary[];
  knowledge?: Array<{
    entry_type: "qa" | "info";
    question: string | null;
    content: string;
  }>;
  /** Hours & place profile. */
  pageProfile?: PageProfile | null;
  /** Active catalog items for priced answers. */
  catalogItems?: CatalogItem[];
  /** Intents picked by the router; undefined = include everything. */
  intents?: Intent[];
  /** Text used to rank FAQ / catalog entries for this turn. */
  query?: string;
  /** This customer's upcoming bookings, one line each (booking intents only). */
  customerBookingLines?: string[];
  /** Photos queued during the turn; delivered after the text reply. */
  pendingPhotos?: Array<{ url: string; itemName?: string }>;
};

/**
 * Product module (subscription feature).
 * AI tools are NOT defined here — they live in `src/ai/tools/` and point at a moduleId.
 */
export type ChasterModule = {
  id: ModuleId;
  label: string;
  description: string;
  /** Core modules are always part of the product shell. */
  core?: boolean;
  /** Prompt section only added when the router picks one of these intents. */
  intents?: Intent[];
  /**
   * Runtime gate beyond subscription (e.g. bookings settings loaded).
   * Entitlement is checked first by the registry.
   */
  isActive?: (ctx: ModuleContext) => boolean;
  /** Extra system-prompt section when this module is active. */
  systemPromptSection?: (ctx: ModuleContext) => string | null;
};
