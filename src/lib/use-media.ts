"use client";

import { useSyncExternalStore } from "react";

function subscribe(query: string) {
  return (onChange: () => void) => {
    if (typeof window === "undefined") return () => {};
    const mq = window.matchMedia(query);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  };
}

/** True when the media query matches. Server snapshot is `fallback`. */
export function useMediaQuery(query: string, fallback = false) {
  return useSyncExternalStore(
    subscribe(query),
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}

/** Desk breakpoint used by list / detail splits. */
export function useIsDesktop() {
  return useMediaQuery("(min-width: 861px)", true);
}
