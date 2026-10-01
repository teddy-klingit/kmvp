import type { NavTabItem } from "@/components/ui/nav-tabs";

/** Shared across every Insights page so the tab row never drifts out of
 * sync between pages when a tab is added or renamed. Content Calendar and
 * Reports live in the main sidebar as their own top-level sections, not
 * here — they aren't "insights" in the sense these tabs are (reporting on
 * data), they're their own workflows. */
export const INSIGHTS_TABS: NavTabItem[] = [
  { label: "Performance", href: "/insights" },
  { label: "Market Intelligence", href: "/insights/market-intelligence" },
  { label: "Community", href: "/insights/community" },
  { label: "Website", href: "/insights/website" },
];
