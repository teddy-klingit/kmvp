import { cn } from "@/lib/utils";

/** Standard padded content wrapper for top-level ops pages (not the
 * client-workspace pages, which manage their own layout + rail). */
export function OpsPage({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("px-10 py-8", className)}>{children}</div>;
}
