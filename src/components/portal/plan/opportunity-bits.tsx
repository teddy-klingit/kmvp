import Link from "next/link";
import { Check } from "lucide-react";
import { SOURCES, sourcesOf, type Source } from "@/lib/opportunities";
import { dismissOpportunityAction } from "@/lib/actions/opportunity-actions";
import { cn } from "@/lib/utils";

/** Source pills: Seasonal moment · Your data · Trend · Competitor. */
export function SourcePills({ sources, className }: { sources: unknown; className?: string }) {
  const list = sourcesOf({ sources: sources as never });
  return (
    <span className={cn("flex flex-wrap gap-1.5", className)}>
      {list.map((s: Source) => (
        <span key={s} className={cn("rounded-full px-2 py-0.5 text-[12px]", SOURCES[s].pill)}>
          {SOURCES[s].label}
        </span>
      ))}
    </span>
  );
}

export function ReviewedFlag() {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] text-brand-ink-2">
      <Check className="size-3" strokeWidth={2} /> Reviewed by Klingit
    </span>
  );
}

/** Not for us: the reasons, stored to tune what comes next. A disclosure so it works without script. */
export function DismissMenu({ id, label = "Dismiss", back = false, reasons }: { id: string; label?: string; back?: boolean; reasons: readonly string[] }) {
  return (
    <details className="group relative">
      <summary className="cursor-pointer list-none text-[13px] text-brand-ink-2 hover:text-brand-ink [&::-webkit-details-marker]:hidden">{label}</summary>
      <div className="absolute right-0 z-10 mt-2 flex w-56 flex-col gap-1 rounded-[12px] border border-brand-line bg-white p-2 shadow-[0_12px_32px_rgba(30,30,30,0.12)]">
        <span className="px-2 py-1 text-[12px] text-brand-ink-2">Why not? It helps us suggest better.</span>
        {reasons.map((r) => (
          <form key={r} action={dismissOpportunityAction}>
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="reason" value={r} />
            {back && <input type="hidden" name="back" value="1" />}
            <button type="submit" className="w-full rounded-[8px] px-2 py-1.5 text-left text-[14px] hover:bg-brand-chip">
              {r}
            </button>
          </form>
        ))}
      </div>
    </details>
  );
}

/** Plan → Calendar's side card: the three newest. */
export function OpportunitiesSideCard({ count, newest }: { count: number; newest: { id: string; title: string; sources: unknown }[] }) {
  return (
    <section aria-label="Opportunities" className="overflow-hidden rounded-[12px] bg-white">
      <h2 className="m-0 flex items-baseline gap-2 border-b border-brand-line px-6 py-5 text-[18px] font-normal">
        Opportunities {count > 0 && <span className="text-[14px] text-brand-ink-2">{count} new</span>}
        <Link href="/plan/opportunities" className="ml-auto font-brand-mono text-[12px] uppercase text-brand-ink underline underline-offset-4">
          All
        </Link>
      </h2>
      {newest.length === 0 ? (
        <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">Nothing new this week. Klingit looks every Monday.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {newest.map((o) => (
            <li key={o.id} className="border-b border-brand-line last:border-b-0">
              <Link href={`/plan/opportunities/${o.id}`} className="flex flex-col gap-2 px-6 py-4 text-brand-ink no-underline hover:bg-[#FBF9F4]">
                <SourcePills sources={o.sources} />
                <span className="text-[15px]">{o.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
