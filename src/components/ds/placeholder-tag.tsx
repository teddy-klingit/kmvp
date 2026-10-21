"use client";

import { createContext, useContext } from "react";
import { cn } from "@/lib/utils";

/** Phase W: the client side never shows Placeholder tags (staff do). The portal layout turns them off. */
const StaffTags = createContext(true);
export function StaffTagsProvider({ show, children }: { show: boolean; children: React.ReactNode }) {
  return <StaffTags.Provider value={show}>{children}</StaffTags.Provider>;
}

/**
 * Marks a number that has no real source yet (plan prices, bundle prices, AI credits per run): the dashed orange
 * PLACEHOLDER label. Staff only (Phase W): clients see the number without it.
 */
export function PlaceholderTag({ children = "Placeholder", className }: { children?: React.ReactNode; className?: string }) {
  if (!useContext(StaffTags)) return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-[6px] border border-dashed border-brand-orange px-2 py-0.5 font-brand-mono text-[10.5px] uppercase tracking-[0.06em] text-brand-orange-text", className)}>
      {children}
    </span>
  );
}
