import { cn } from "@/lib/utils";

export type SummaryItem = { key: string; label: string; value: React.ReactNode; wide?: boolean; leading?: React.ReactNode };

/** Facts row inside the header card, separated by hairline dividers. Pass only facts that have a value. */
export function SummaryBar({ items, className }: { items: SummaryItem[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <div className={cn("@container border-y border-ds-divider", className)}>
      <div className="grid grid-cols-2 @[640px]:flex">
        {items.map((item) => (
          <div
            key={item.key}
            className={cn(
              "flex min-w-0 items-center gap-2.5 border-ds-divider px-5 py-3.5 @[640px]:min-w-[140px] @[640px]:px-6",
              "odd:border-r last:border-r-0 @[640px]:odd:border-r-0 [&:nth-child(n+3)]:border-t @[640px]:[&:nth-child(n+3)]:border-t-0 @[640px]:[&:not(:last-child)]:border-r",
              item.wide ? "@[640px]:flex-[1.3]" : "@[640px]:flex-1"
            )}
          >
            {item.leading && <span className="hidden @[640px]:flex">{item.leading}</span>}
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[12px] text-ds-text-2">{item.label}</span>
              <span className="text-[15px] font-semibold tabular-nums text-ds-text">{item.value}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
