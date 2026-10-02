"use client";

import { SegmentedNav } from "@/components/ds/segmented-control";

/** Section tabs under a header card, as pills. The most specific matching href is active. */
export function PageTabs({ items, label }: { items: { label: string; href: string }[]; label: string }) {
  return <SegmentedNav items={items} label={label} />;
}
