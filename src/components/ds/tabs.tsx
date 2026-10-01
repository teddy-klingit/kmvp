"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Underline tabs directly under a header card. The most specific matching href is active. */
export function PageTabs({ items, label }: { items: { label: string; href: string }[]; label: string }) {
  const pathname = usePathname() ?? "";
  const active = items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label={label} className="flex gap-6 overflow-x-auto border-b border-ds-border">
      {items.map((i) => {
        const on = i.href === active;
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className={cn(
              "-mb-px whitespace-nowrap border-b-2 py-3 sm:py-2.5 text-[14px] no-underline",
              on ? "border-ds-text font-semibold text-ds-text" : "border-transparent font-medium text-ds-text-2 hover:text-ds-text"
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
