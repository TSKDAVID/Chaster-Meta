"use client";

import type { ReactNode } from "react";
import Dashboard from "@/components/Dashboard";

/** Persistent desk shell — URL segments live under (desk) so refresh keeps the view. */
export default function DeskLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Dashboard />
      {children}
    </>
  );
}
