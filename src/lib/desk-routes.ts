import type { DeskView } from "@/components/Navbar";

/** Bookings desk tabs. `team` / `catalog` live under Resources in the UI. */
export type BookingDeskTab = "schedule" | "setup" | "team" | "catalog";
export type KnowledgeDeskTab = "faq" | "suggestions";

export type DeskLocation = {
  view: DeskView;
  bookingTab: BookingDeskTab;
  knowledgeTab: KnowledgeDeskTab;
};

export function isResourcesTab(tab: BookingDeskTab) {
  return tab === "team" || tab === "catalog";
}

export function parseDeskPath(pathname: string): DeskLocation {
  const path = pathname.replace(/\/+$/, "") || "/";

  if (path === "/bookings/setup") {
    return { view: "bookings", bookingTab: "setup", knowledgeTab: "faq" };
  }
  if (path === "/bookings/resources/catalog") {
    return { view: "bookings", bookingTab: "catalog", knowledgeTab: "faq" };
  }
  if (
    path === "/bookings/resources" ||
    path === "/bookings/resources/team" ||
    path.startsWith("/bookings/resources/")
  ) {
    return { view: "bookings", bookingTab: "team", knowledgeTab: "faq" };
  }
  if (path === "/bookings" || path.startsWith("/bookings/")) {
    return { view: "bookings", bookingTab: "schedule", knowledgeTab: "faq" };
  }
  if (path === "/faqs/suggestions") {
    return { view: "knowledge", bookingTab: "schedule", knowledgeTab: "suggestions" };
  }
  if (path === "/faqs" || path.startsWith("/faqs/")) {
    return { view: "knowledge", bookingTab: "schedule", knowledgeTab: "faq" };
  }
  if (path === "/hours" || path.startsWith("/hours/")) {
    return { view: "hours", bookingTab: "schedule", knowledgeTab: "faq" };
  }
  if (path === "/catalog" || path.startsWith("/catalog/")) {
    return { view: "catalog", bookingTab: "schedule", knowledgeTab: "faq" };
  }
  return { view: "inbox", bookingTab: "schedule", knowledgeTab: "faq" };
}

export function deskHref(
  view: DeskView,
  opts?: { bookingTab?: BookingDeskTab; knowledgeTab?: KnowledgeDeskTab },
): string {
  if (view === "bookings") {
    if (opts?.bookingTab === "setup") return "/bookings/setup";
    if (opts?.bookingTab === "catalog") return "/bookings/resources/catalog";
    if (opts?.bookingTab === "team") return "/bookings/resources";
    return "/bookings";
  }
  if (view === "knowledge") {
    return opts?.knowledgeTab === "suggestions" ? "/faqs/suggestions" : "/faqs";
  }
  if (view === "hours") return "/hours";
  if (view === "catalog") return "/catalog";
  return "/inbox";
}
