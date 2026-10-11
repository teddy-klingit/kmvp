import { cn } from "@/lib/utils";

/**
 * Marks a number that has no real source yet (plan prices, bundle prices, AI credits per run): the dashed orange
 * PLACEHOLDER label. Never show such a number without it.
 */
export function PlaceholderTag({ children = "Placeholder", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center whitespace-nowrap rounded-[6px] border border-dashed border-brand-orange px-2 py-0.5 font-brand-mono text-[10.5px] uppercase tracking-[0.06em] text-brand-orange-text", className)}>
      {children}
    </span>
  );
}
