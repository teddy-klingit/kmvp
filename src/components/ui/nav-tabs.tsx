"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type NavTabItem = { label: string; href: string };

/**
 * Route-driven tab strip (not stateful tabs) — used for the secondary/tertiary
 * navigation levels seen in the mockups, e.g. Estimate/Brief on a client
 * screen, or the 10-step pipeline strip in the ops console. Active state is
 * derived from the current pathname so the browser back/forward and deep
 * links keep working.
 */
function NavTabs({
  items,
  className,
  size = "md",
}: {
  items: NavTabItem[];
  className?: string;
  size?: "sm" | "md";
}) {
  const pathname = usePathname() ?? "";
  // Pick the single most-specific matching href (longest match wins) so a
  // parent tab (e.g. "/insights") doesn't also light up on a child route
  // (e.g. "/insights/market-intelligence").
  const activeHref = items
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className={cn("flex items-center gap-5 border-b border-border", className)}>
      {items.map((item) => {
        const active = item.href === activeHref;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "-mb-px border-b pb-2.5 font-medium transition-colors",
              size === "sm" ? "text-[13px]" : "text-sm",
              active ? "border-ink text-ink" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export { NavTabs };
