import Link from "next/link";
import { cn } from "@/lib/utils";

export type FilterChip = { label: string; href: string; active: boolean; count?: number };

/**
 * Filter chips: the second level of navigation (never a second tab bar). Links, so each filter has its
 * own URL. Active chip is ink; the rest are outlined.
 */
export function FilterChips({ items, label, className }: { items: FilterChip[]; label: string; className?: string }) {
  return (
    <nav aria-label={label} className={cn("flex flex-wrap gap-2", className)}>
      {items.map((i) => (
        <Link
          key={i.href + i.label}
          href={i.href}
          scroll={false}
          aria-current={i.active ? "page" : undefined}
          className={cn(
            "inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-[13px] no-underline transition-colors sm:h-8",
            i.active ? "border-brand-ink bg-brand-ink text-white" : "border-[#DCD6C8] bg-white text-brand-ink hover:border-brand-ink"
          )}
        >
          {i.label}
          {i.count !== undefined && <span className={cn("tabular-nums", i.active ? "text-white/75" : "text-brand-ink-2")}>· {i.count}</span>}
        </Link>
      ))}
    </nav>
  );
}
