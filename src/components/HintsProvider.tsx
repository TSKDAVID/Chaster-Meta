"use client";

import { createContext, useContext, type ReactNode } from "react";

const HintsContext = createContext(true);

export function HintsProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return (
    <HintsContext.Provider value={enabled}>{children}</HintsContext.Provider>
  );
}

export function useHintsEnabled() {
  return useContext(HintsContext);
}
