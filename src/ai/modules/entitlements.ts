import type { ModuleId } from "./types";

/**
 * Subscription / plan entitlements.
 * Testing phase: every module is entitled.
 * Later: load from Stripe/billing table keyed by facebook_user_id / account.
 */
export type AccountEntitlements = {
  /** Stable account key when available (FB user id, etc.). */
  accountId?: string;
  modules: Record<ModuleId, boolean>;
};

const ALL_ON: Record<ModuleId, boolean> = {
  inbox: true,
  knowledge: true,
  bookings: true,
  resources: true,
  media: true,
  hours: true,
  catalog: true,
};

/** Resolve what the account may use. For now always all modules. */
export function getEntitlements(accountId?: string): AccountEntitlements {
  return {
    accountId,
    modules: { ...ALL_ON },
  };
}

export function isModuleEntitled(
  entitlements: AccountEntitlements,
  id: ModuleId,
): boolean {
  return entitlements.modules[id] === true;
}
