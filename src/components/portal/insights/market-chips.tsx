"use client";

import { usePathname } from "next/navigation";
import { FilterChips } from "@/components/ds/filter-chips";

const VIEWS = [
  { label: "Feed", href: "/insights/market" },
  { label: "Competitors", href: "/insights/market/competitors" },
  { label: "Trends", href: "/insights/market/trends" },
];

export function MarketChips() {
  const pathname = usePathname();
  return <FilterChips label="Market views" items={VIEWS.map((v) => ({ ...v, active: pathname === v.href }))} />;
}
