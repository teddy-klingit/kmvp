import { cn } from "@/lib/utils";

export type SummaryItem = { key: string; label: string; value: React.ReactNode; wide?: boolean; leading?: React.ReactNode };

/**
 * Facts row inside the header card, separated by hairline dividers. Pass only facts that have a value.
 * One row when the page's main column (the `@container/main` ancestor) is at least 1100px wide, otherwise 2×2.
 */
export function SummaryBar({ items, className }: { items: SummaryItem[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <div className={cn("border-y border-ds-divider", className)}>
      <div className="grid grid-cols-2 @min-[1100px]/main:flex">
        {items.map((item) => (
          <div
            key={item.key}
            className={cn(
              "flex min-w-0 items-center gap-2.5 border-ds-divider px-5 py-3.5 @min-[1100px]/main:min-w-[140px] @min-[1100px]/main:px-6",
              "odd:border-r last:border-r-0 @min-[1100px]/main:odd:border-r-0 [&:nth-child(n+3)]:border-t @min-[1100px]/main:[&:nth-child(n+3)]:border-t-0 @min-[1100px]/main:[&:not(:last-child)]:border-r",
              item.wide ? "@min-[1100px]/main:flex-[1.3]" : "@min-[1100px]/main:flex-1"
            )}
          >
            {item.leading && <span className="hidden sm:flex">{item.leading}</span>}
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="whitespace-nowrap text-[12px] text-ds-text-2">{item.label}</span>
              <span className="text-[15px] font-semibold tabular-nums text-ds-text sm:truncate sm:whitespace-nowrap">{item.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
