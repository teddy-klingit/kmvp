import { cn } from "@/lib/utils";

/**
 * The 12-column page grid: main 8, side 4, 24px gap. Under 1000px of viewport it's one column and the
 * side column moves under the main one. The main column is a container (`@container/col`) so rows inside
 * it can adapt to its width.
 */
export function PageGrid({ main, side, className }: { main: React.ReactNode; side?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid grid-cols-1 items-start gap-6", side && "min-[1000px]:grid-cols-12", className)}>
      <div className={cn("@container/col flex min-w-0 flex-col gap-6", side && "min-[1000px]:col-span-8")}>{main}</div>
      {side && <aside className="@container/side flex min-w-0 flex-col gap-6 min-[1000px]:col-span-4">{side}</aside>}
    </div>
  );
}

/** The page column every client and ops page sits in: max 1120px, 24px between header and sections. */
export function Page({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("mx-auto flex w-full max-w-[1120px] flex-col gap-6", className)}>{children}</div>;
}
