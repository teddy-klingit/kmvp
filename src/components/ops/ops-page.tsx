import { cn } from "@/lib/utils";

/** Standard padded content wrapper for top-level ops pages (brand shell: 40/40/56/16, max 1120px, 16px gutters on phones).
 * Not used by the client-workspace pages, which manage their own layout + rail. */
export function OpsPage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="px-4 pb-12 pt-5 min-[900px]:pb-14 min-[900px]:pl-4 min-[900px]:pr-10 min-[900px]:pt-10">
      <div className={cn("mx-auto flex w-full max-w-[1120px] flex-col gap-6", className)}>{children}</div>
    </div>
  );
}
