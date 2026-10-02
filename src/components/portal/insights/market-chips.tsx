"use client";

import { usePathname } from "next/navigation";
import { FilterChips } from "@/components/ds/filter-chips";

const VIEWS = [
  { label: "Feed", href: "/insights/market" },
  { label: "Competitors", href: "/insights/market/competitors" },
  { label: "Trends", href: "/insights/market/trends" },
  { label: "Ideas", href: "/insights/market/ideas" },
];

export function MarketChips({ newIdeas }: { newIdeas: number }) {
  const pathname = usePathname();
  return <FilterChips label="Market views" items={VIEWS.map((v) => ({ ...v, active: pathname === v.href, count: v.label === "Ideas" && newIdeas > 0 ? newIdeas : undefined }))} />;
}
