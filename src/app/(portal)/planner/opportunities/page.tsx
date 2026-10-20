import Link from "next/link";
import { CONFIDENCE_LABEL, type Combined, type Confidence } from "@/lib/combined";
import { Chips } from "@/components/insights/source-chip";
import { Check } from "lucide-react";
import { getPortalViewer } from "@/lib/current-viewer";
import { prisma } from "@/lib/prisma";
import { pillClass } from "@/components/ds/button";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { countBySource, costRange, DISMISS_REASONS, isSource, listOpportunities, quarterStats, SOURCES, windowLabel, type Source } from "@/lib/opportunities";
import { briefRouteAction } from "@/lib/actions/opportunity-actions";
import { DismissMenu, ReviewedFlag, SourcePills } from "@/components/portal/plan/opportunity-bits";
import { AskForMore } from "@/components/portal/plan/ask-for-more";
import { cn } from "@/lib/utils";

const FILTER_LABEL: Record<Source, string> = { seasonal: "Seasonal moments", data: "Your data", trend: "Trends", competitor: "Competitors" };

/**
 * Plan → Opportunities (Phase R, design 06): what Klingit suggests making next, soonest window first, each with why
 * now, the window, its routes and a cost range. Replaces Insights → Ideas and the calendar's suggestions.
 */
export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ source?: string; dismissed?: string }> }) {
  const q = await searchParams;
  const viewer = await getPortalViewer();
  const source = isSource(q.source) ? q.source : null;
  const [list, counts, stats] = await Promise.all([listOpportunities(viewer.clientId, { source }), countBySource(viewer.clientId), quarterStats(viewer.clientId)]);
  const items = await prisma.clientCalendarItem.findMany({ where: { clientId: viewer.clientId, archivedAt: null, opportunityId: { in: list.map((o) => o.id) } }, orderBy: { createdAt: "desc" }, select: { id: true, opportunityId: true } });
  const planItem = new Map(items.map((i) => [i.opportunityId, i.id]));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/planner/opportunities" aria-current={!source ? "page" : undefined} className={chip(!source)}>
          All · {counts.all}
        </Link>
        {(Object.keys(SOURCES) as Source[]).map((s) => (
          <Link key={s} href={`/planner/opportunities?source=${s}`} aria-current={source === s ? "page" : undefined} className={chip(source === s)}>
            {FILTER_LABEL[s]}
            {counts[s] > 0 && source !== s ? <span className="ml-1.5 text-brand-ink-2">{counts[s]}</span> : null}
          </Link>
        ))}
        <span className="ml-auto text-[13px] text-brand-ink-2">Sort: soonest window</span>
      </div>
      {q.dismissed && <p className="m-0 text-[14px] text-brand-ink-2">Dismissed. Thanks, that helps us suggest better.</p>}

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          {list.length === 0 ? (
            <section className="rounded-[12px] bg-white px-6 py-8 text-[15px] text-brand-ink-2">{source ? `No ${FILTER_LABEL[source].toLowerCase()} right now.` : "No opportunities yet. Klingit looks at your results, trends, competitors and the season every week."}</section>
          ) : (
            list.map((o) => {
              const added = o.status === "added" || o.status === "briefed" || o.status === "live";
              const cost = costRange(o.routes);
              const inPlan = planItem.get(o.id);
              // Phase V: built from several sources: its effect, cost and decide-by, with the rule-based confidence.
              const combined = o.combined as unknown as Combined | null;
              if (combined)
                return (
                  <article key={o.id} aria-labelledby={`opp-${o.id}`} className="flex flex-col gap-3 rounded-[12px] bg-white px-6 py-5">
                    <span className="flex flex-wrap items-center gap-3">
                      <span className="flex-1">
                        <Chips sources={combined.sources} />
                      </span>
                      {o.confidence && <span className="rounded-full bg-[#E4F2B3] px-2.5 py-0.5 text-[12px] text-[#5E6B2A]">{CONFIDENCE_LABEL[o.confidence as Confidence]}</span>}
                      {added && (
                        <span className="inline-flex items-center gap-1 text-[13px]">
                          <Check className="size-3.5" strokeWidth={2} /> Added to plan
                        </span>
                      )}
                    </span>
                    <h2 id={`opp-${o.id}`} className="m-0 text-[20px] font-normal">
                      <Link href={`/planner/opportunities/${o.id}`} className="text-brand-ink no-underline hover:underline">
                        {o.title}
                      </Link>
                    </h2>
                    <p className="m-0 max-w-[70ch] text-[14px] leading-[1.55]">{o.summary}</p>
                    <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-brand-ink-2">
                      <span className="text-brand-ink">{combined.effect.text}</span>
                      <span>{combined.cost.text}</span>
                      <span>{combined.dataSize}</span>
                      {o.isDemo && <span>demo data</span>}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <Link href={`/planner/opportunities/${o.id}`} className={pillClass(added ? "secondary" : "primary", "sm")}>
                        See why
                      </Link>
                      {added && inPlan && (
                        <Link href={`/planner?item=${inPlan}`} className={pillClass("secondary", "sm")}>
                          Open in plan
                        </Link>
                      )}
                    </div>
                  </article>
                );
              return (
                <article key={o.id} aria-labelledby={`opp-${o.id}`} className="flex flex-col gap-3 rounded-[12px] bg-white px-6 py-5">
                  <span className="flex flex-wrap items-center gap-3">
                    <SourcePills sources={o.sources} className="flex-1" />
                    {o.reviewedAt && <ReviewedFlag />}
                    {added && (
                      <span className="inline-flex items-center gap-1 text-[13px]">
                        <Check className="size-3.5" strokeWidth={2} /> {o.status === "briefed" ? "Briefed to Klingit" : o.status === "live" ? "Live" : "Added to plan"}
                      </span>
                    )}
                  </span>
                  <h2 id={`opp-${o.id}`} className="m-0 text-[20px] font-normal">
                    <Link href={`/planner/opportunities/${o.id}`} className="text-brand-ink no-underline hover:underline">
                      {o.title}
                    </Link>
                  </h2>
                  <p className="m-0 max-w-[70ch] text-[14px] leading-[1.55]">{o.whyNow ?? o.summary}</p>
                  <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-brand-ink-2">
                    <span className="text-brand-ink">{o.windowStart || o.windowEnd ? `Best window ${windowLabel(o)}` : windowLabel(o)}</span>
                    <span>
                      {o.routes.length} route{o.routes.length === 1 ? "" : "s"}
                    </span>
                    {cost && (
                      <span className="flex items-center gap-2">
                        {cost} <PlaceholderTag>Placeholder</PlaceholderTag>
                      </span>
                    )}
                    {o.isDemo && <span>demo data</span>}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <Link href={`/planner/opportunities/${o.id}`} className={pillClass(added ? "secondary" : "primary", "sm")}>
                      View routes
                    </Link>
                    {added && inPlan ? (
                      <Link href={`/planner?item=${inPlan}`} className={pillClass("secondary", "sm")}>
                        Open in plan
                      </Link>
                    ) : (
                      <>
                        <Link href={`/planner?add=1&opportunity=${o.id}`} className={pillClass("secondary", "sm")}>
                          Add to plan
                        </Link>
                        <form action={briefRouteAction}>
                          <input type="hidden" name="id" value={o.id} />
                          <input type="hidden" name="route" value={o.routes[0]?.letter ?? "A"} />
                          <button type="submit" className={pillClass("secondary", "sm")}>
                            Brief Klingit
                          </button>
                        </form>
                      </>
                    )}
                    <span className="ml-auto">
                      <DismissMenu id={o.id} reasons={DISMISS_REASONS} />
                    </span>
                  </div>
                </article>
              );
            })
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <section aria-label="How opportunities work" className="overflow-hidden rounded-[12px] bg-white">
            <h2 className="m-0 border-b border-brand-line px-6 py-5 text-[18px] font-normal">How opportunities work</h2>
            <div className="flex flex-col gap-3 px-6 py-5 text-[14px] leading-[1.5]">
              <p className="m-0">Klingit looks at your results, trends, competitors and the season every week and suggests what to make next.</p>
              <p className="m-0">Each opportunity shows why, when, and 2–3 ways to do it. Add one to your plan, brief Klingit, or run a skill.</p>
              <p className="m-0">Dismissing asks why, so the next ones fit you better.</p>
              <AskForMore />
            </div>
          </section>
          <section aria-label="This quarter" className="overflow-hidden rounded-[12px] bg-white">
            <h2 className="m-0 border-b border-brand-line px-6 py-5 text-[18px] font-normal">This quarter</h2>
            <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-5 px-6 py-5">
              {[
                { n: stats.suggested, l: "suggested this quarter" },
                { n: stats.added, l: "added to plan" },
                { n: stats.briefed, l: "briefed to Klingit" },
                { n: stats.live, l: stats.top ? `live, ${stats.top} top performer${stats.top === 1 ? "" : "s"}` : "live" },
              ].map((s) => (
                <div key={s.l} className="flex flex-col gap-1">
                  <dt className="order-2 text-[12px] text-brand-ink-2">{s.l}</dt>
                  <dd className="order-1 m-0 text-[28px] leading-none tabular-nums">{s.n}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}

const chip = (on: boolean) => cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[14px] no-underline", on ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline bg-white text-brand-ink hover:border-brand-ink");
