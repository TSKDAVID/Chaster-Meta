import type { ChasterModule } from "@/modules/types";

/**
 * Core messaging desk — always on.
 * No AI tools yet; reserved so entitlements / nav can treat Inbox as a module.
 */
export const inboxModule: ChasterModule = {
  id: "inbox",
  label: "Inbox",
  description: "Messenger / Instagram operator desk and AI auto-replies.",
  core: true,
};
