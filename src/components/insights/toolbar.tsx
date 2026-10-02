"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * The Insights toolbar (README "Insights v2"): the date range sits on the right of the tab row (Overview) or of
 * the filter-chip row (Performance, Market, Audience), applies to the whole tab and lives in the URL (?range=).
 */
const RANGES = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

export function RangePicker({ className }: { className?: string }) {
  const pathname = usePathname() ?? "/insights";
  const params = useSearchParams();
  const current = params?.get("range") ?? "30";
  return (
    <nav aria-label="Date range" className={cn("flex w-max shrink-0 gap-1 rounded-full bg-[var(--seg-track)] p-1", className)}>
      {RANGES.map((r) => {
        const q = new URLSearchParams(params?.toString() ?? "");
        if (r.value === "30") q.delete("range");
        else q.set("range", r.value);
        const on = current === r.value;
        return (
          <Link
            key={r.value}
            href={`${pathname}${q.size ? `?${q}` : ""}`}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={cn(
              "inline-flex h-11 items-center whitespace-nowrap rounded-full px-[18px] text-[14px] no-underline transition-colors sm:h-9",
              on ? "bg-[var(--seg-active)] text-white" : "text-[var(--seg-text)] hover:bg-black/5"
            )}
          >
            {r.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** What sits on the right of the tab row: the range on Overview, "Run audit again" on SEO, nothing elsewhere. */
export function TabRowEnd({ seo }: { seo: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  if (pathname === "/insights") return <RangePicker />;
  if (pathname === "/insights/seo") return <>{seo}</>;
  return null;
}

/** Filter chips on the left, the range on the right (wraps under on phones). */
export function SubBar({ chips, range = true }: { chips: React.ReactNode; range?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">{chips}</div>
      {range && <RangePicker />}
    </div>
  );
}

/** Market's views keep the range on the right, except Ideas, which has none. */
export function MarketBar({ chips }: { chips: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  return <SubBar chips={chips} range={pathname !== "/insights/market/ideas"} />;
}
