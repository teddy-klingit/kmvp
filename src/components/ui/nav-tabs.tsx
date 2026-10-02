"use client";

import { SegmentedNav } from "@/components/ds/segmented-control";

export type NavTabItem = { label: string; href: string };

/**
 * Route-driven tab strip (not stateful tabs) for secondary navigation, e.g. Account sections or Brand
 * health. It renders the app's one tab style, the pill SegmentedNav. Active state comes from the pathname
 * (most specific match wins), so back/forward and deep links keep working.
 */
function NavTabs({ items, className }: { items: NavTabItem[]; className?: string; size?: "sm" | "md" }) {
  return <SegmentedNav items={items} label="Sections" className={className} />;
}

export { NavTabs };
