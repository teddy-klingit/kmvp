"use client";

import { usePathname } from "next/navigation";
import { FilterChips } from "@/components/ds/filter-chips";

/** FilterChips driven by the route (a second level of navigation under a SegmentedNav). Exact match by default, or any of `also`. */
export function RouteChips({ items, label }: { items: { label: string; href: string; also?: string[] }[]; label: string }) {
  const pathname = usePathname() ?? "";
  const on = (i: (typeof items)[number]) => pathname === i.href || (i.also ?? []).some((p) => pathname === p || pathname.startsWith(p + "/"));
  return <FilterChips label={label} items={items.map((i) => ({ label: i.label, href: i.href, active: on(i) }))} />;
}
