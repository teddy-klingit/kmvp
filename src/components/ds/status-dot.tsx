import { cn } from "@/lib/utils";

export type DotTone = "you" | "klingit" | "done" | "paused";

/** Orange = waiting on you (your action), ink = Klingit working, green = done, grey = paused. */
export const DOT_CLASS: Record<DotTone, string> = {
  you: "bg-brand-orange",
  klingit: "bg-brand-ink",
  done: "bg-brand-lime-strong",
  paused: "bg-brand-outline",
};

/** A status in plain words with its dot: "● Waiting on you". */
export function StatusDot({ tone, children, className }: { tone: DotTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2 text-[14px] text-brand-ink", className)}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT_CLASS[tone])} />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** The legend under a board or calendar. */
export function DotLegend({ items, className }: { items: { tone: DotTone; label: string }[]; className?: string }) {
  return (
    <div className={cn("flex flex-wrap gap-x-5 gap-y-2 text-[12px] text-brand-ink-2", className)}>
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-2">
          <span aria-hidden className={cn("size-2 rounded-full", DOT_CLASS[i.tone])} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
