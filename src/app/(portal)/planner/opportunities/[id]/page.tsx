import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getPortalViewer } from "@/lib/current-viewer";
import { prisma } from "@/lib/prisma";
import { jsonArray, cn } from "@/lib/utils";
import { pillClass } from "@/components/ds/button";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { loadLeadTimes } from "@/lib/plan";
import { chartOf, DISMISS_REASONS, evidenceOf, loadOpportunity, opportunityBriefBy, routeCost, windowLabel, type Chart, type RouteCheck } from "@/lib/opportunities";
import { briefRouteAction, dismissOpportunityAction } from "@/lib/actions/opportunity-actions";
import { ReviewedFlag, SourcePills } from "@/components/portal/plan/opportunity-bits";
import { AnotherRoute } from "@/components/portal/plan/ask-for-more";
import { OpportunityAdd } from "@/components/portal/plan/opportunity-add";

const NUMBER = ["No", "One", "Two", "Three", "Four", "Five"];
const wday = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * One opportunity (Phase R, design 07): why now (a small chart and up to three evidence numbers, each with where it
 * comes from), the routes with their rule-checked sample lines and costs, and on the side Add to plan and the other
 * options (a skill, Not for us).
 */
export default async function OpportunityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ route?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const viewer = await getPortalViewer();
  const o = await loadOpportunity(viewer.clientId, id);
  if (!o) notFound();
  const picked = o.routes.find((r) => r.letter === q.route) ?? o.routes.find((r) => r.status !== "new" && r.status !== "dismissed") ?? o.routes[0] ?? null;
  const [leadTimes, skill, briefBy] = await Promise.all([
    loadLeadTimes(),
    o.skillKey ? prisma.agent.findUnique({ where: { key: o.skillKey }, select: { id: true, name: true, availability: true } }) : null,
    opportunityBriefBy(o, picked),
  ]);
  const evidence = evidenceOf(o).slice(0, 3);
  const chart = chartOf(o);
  const now = new Date();

  return (
    <div className="flex flex-col gap-6">
      <Link href="/planner/opportunities" className="-mt-2 inline-flex items-center gap-1 self-start text-[13px] text-brand-ink-2 no-underline hover:text-brand-ink">
        <ChevronLeft className="size-3.5" /> Opportunities
      </Link>

      <header className="flex flex-col gap-4 rounded-[12px] bg-white px-7 py-6">
        <span className="flex flex-wrap items-center gap-3">
          <SourcePills sources={o.sources} className="flex-1" />
          {o.reviewedAt && <ReviewedFlag />}
          <span className="text-[12px] text-brand-ink-2">
            Suggested {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(o.createdAt)} · for {viewer.client.name}
            {o.isDemo ? " · demo data" : ""}
          </span>
        </span>
        <h1 className="m-0 text-[34px] font-normal leading-[1.15] [text-wrap:balance]">{o.title}</h1>
        <p className="m-0 max-w-[68ch] text-[16px] leading-[1.6]">{o.summary}</p>
        <dl className="m-0 grid grid-cols-1 border-t border-brand-line sm:grid-cols-3">
          {[
            { k: "Best window", v: o.windowStart || o.windowEnd ? windowLabel(o, { weekday: true }) : windowLabel(o) },
            { k: "Brief by", v: briefBy ? `${wday(briefBy)}, for Klingit to make it` : "Whenever you're ready" },
            { k: "Fits", v: o.fitsLabel ?? "A new piece of work" },
          ].map((x) => (
            <div key={x.k} className="flex flex-col gap-1 border-brand-line py-4 sm:border-l sm:px-4 sm:first:border-l-0 sm:first:pl-0">
              <dt className="text-[12px] text-brand-ink-2">{x.k}</dt>
              <dd className="m-0 text-[15px]">{x.v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <section aria-label="Routes" className="overflow-hidden rounded-[12px] bg-white">
            <h2 className="m-0 flex flex-wrap items-baseline gap-2 border-b border-brand-line px-6 py-5 text-[18px] font-normal">
              {NUMBER[o.routes.length] ?? o.routes.length} way{o.routes.length === 1 ? "" : "s"} to do it <span className="text-[13px] text-brand-ink-2">· pick one</span>
              <span className="ml-auto">
                <AnotherRoute id={o.id} />
              </span>
            </h2>
            <ul className="m-0 list-none p-0">
              {o.routes.map((r) => {
                const on = picked?.id === r.id;
                const check = r.sampleCheck as RouteCheck | null;
                const cost = routeCost(r);
                return (
                  <li key={r.id} className={cn("grid grid-cols-1 gap-4 border-b border-brand-line px-6 py-5 min-[760px]:grid-cols-[minmax(0,1fr)_230px]", on && "border-l-[3px] border-l-brand-ink bg-[#FBF9F4] pl-[21px]")}>
                    <div className="flex min-w-0 gap-3">
                      <Link href={`/planner/opportunities/${o.id}?route=${r.letter}#add`} scroll={false} aria-label={`Pick route ${r.letter}`} aria-current={on ? "true" : undefined} className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", on ? "border-brand-ink" : "border-brand-outline")}>
                        {on && <span className="size-2.5 rounded-full bg-brand-ink" />}
                      </Link>
                      <div className="flex min-w-0 flex-col gap-2">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="font-brand-mono text-[11px] text-brand-ink-2">ROUTE {r.letter}</span>
                          <span className="text-[17px]">{r.name}</span>
                          {r.status !== "new" && r.status !== "dismissed" && <span className="rounded-full bg-[#E9F2C9] px-2 py-0.5 text-[12px]">{r.status === "added" ? "Picked" : r.status === "briefed" ? "Briefed" : "Live"}</span>}
                        </span>
                        <p className="m-0 text-[14px] leading-[1.55]">{r.description}</p>
                        <span className="flex flex-wrap gap-1.5">
                          {jsonArray<string>(r.formats).map((f) => (
                            <span key={f} className="rounded-full bg-brand-chip px-2 py-0.5 text-[12px]">
                              {f}
                            </span>
                          ))}
                          {jsonArray<string>(r.channels).map((c) => (
                            <span key={c} className="rounded-full bg-[#E6ECF5] px-2 py-0.5 text-[12px]">
                              {c}
                            </span>
                          ))}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      {r.sampleLine && (
                        <figure className="m-0 flex flex-col gap-1 rounded-[8px] bg-[#FBF6EE] px-3.5 py-3">
                          <blockquote className="m-0 font-serif text-[16px] leading-[1.4]">{r.sampleLine}</blockquote>
                          {check && !check.ok && <figcaption className="text-[11px] text-brand-ink-2">Fixed by the rule check: {check.violations.map((v) => v.rule).join("; ")}</figcaption>}
                        </figure>
                      )}
                      <span className="flex flex-wrap items-center gap-2">
                        {cost && <span className="flex-1 text-[13px]">{cost}</span>}
                        <form action={briefRouteAction}>
                          <input type="hidden" name="id" value={o.id} />
                          <input type="hidden" name="route" value={r.letter} />
                          <button type="submit" className={pillClass("secondary", "sm")}>
                            Brief Klingit
                          </button>
                        </form>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="m-0 flex flex-wrap items-center gap-2 px-6 py-3.5 text-[12px] text-brand-ink-2">
              Sample lines are written in your voice and checked against your rules. <PlaceholderTag>Costs</PlaceholderTag>
            </p>
          </section>

          <section aria-label="Why we suggest it" className="overflow-hidden rounded-[12px] bg-white">
            <h2 className="m-0 border-b border-brand-line px-6 py-5 text-[18px] font-normal">Why we suggest it</h2>
            <div className={cn("grid grid-cols-1 gap-6 px-6 py-5", chart && "min-[760px]:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]")}>
              {chart && <Columns chart={chart} />}
              <dl className="m-0 flex flex-col gap-4">
                {evidence.map((e, i) => (
                  <div key={i} className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-3">
                    <dt className="text-[22px] leading-tight tabular-nums">{e.value}</dt>
                    <dd className="m-0 text-[14px] leading-[1.45]">
                      {e.text} <span className="text-brand-ink-2">({e.source}{e.demo ? ", demo" : ""})</span>
                    </dd>
                  </div>
                ))}
                {evidence.length === 0 && <p className="m-0 text-[14px] text-brand-ink-2">Klingit added this one by hand.</p>}
              </dl>
            </div>
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <section aria-label="Add to plan" className="overflow-hidden rounded-[12px] bg-white">
            <h2 className="m-0 border-b border-brand-line px-6 py-5 text-[18px] font-normal">Add to plan</h2>
            <OpportunityAdd
              key={picked?.id ?? "none"}
              opportunityId={o.id}
              title={o.title}
              route={picked ? { letter: picked.letter, name: picked.name, description: picked.description, formats: jsonArray<string>(picked.formats), channels: jsonArray<string>(picked.channels), cost: routeCost(picked) || null } : null}
              windowStart={o.windowStart ? iso(o.windowStart) : null}
              windowEnd={o.windowEnd ? iso(o.windowEnd) : null}
              leadTimes={leadTimes.map((l) => ({ format: l.format, workingDays: l.workingDays, teamCredits: l.teamCredits }))}
              today={iso(now)}
            />
          </section>
          <section aria-label="Other options" className="overflow-hidden rounded-[12px] bg-white">
            <h2 className="m-0 border-b border-brand-line px-6 py-5 text-[18px] font-normal">Other options</h2>
            <div className="flex flex-col gap-4 px-6 py-5">
              {skill && skill.availability === "self_service" && (
                <Link href={`/skills/${skill.id}?say=${encodeURIComponent(`${o.title}${picked?.sampleLine ? `. Like: ${picked.sampleLine}` : ""}`)}`} className={cn(pillClass("secondary", "sm"), "h-auto min-h-9 self-start whitespace-normal py-2 text-left")}>
                  Make it with a skill: {skill.name}
                </Link>
              )}
              <div className="flex flex-col gap-2 border-t border-brand-line pt-4">
                <span className="text-[14px]">Not for us</span>
                <span className="flex flex-wrap gap-2">
                  {DISMISS_REASONS.map((r) => (
                    <form key={r} action={dismissOpportunityAction}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="reason" value={r} />
                      <input type="hidden" name="back" value="1" />
                      <button type="submit" className="inline-flex h-9 items-center rounded-full border border-brand-outline bg-white px-3.5 text-[14px] hover:border-brand-ink">
                        {r}
                      </button>
                    </form>
                  ))}
                </span>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

/** The one small chart: columns on one scale, the moment highlighted. */
function Columns({ chart }: { chart: Chart }) {
  const max = Math.max(...chart.bars.map((b) => b.value), 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  return (
    <figure className="m-0 flex min-w-0 flex-col gap-3">
      <figcaption className="flex flex-col gap-0.5">
        <span className="text-[15px]">{chart.title}</span>
        {chart.subtitle && <span className="text-[13px] text-brand-ink-2">{chart.subtitle}</span>}
      </figcaption>
      <div className="grid grid-cols-[28px_minmax(0,1fr)] gap-2">
        <div className="relative h-[120px] font-brand-mono text-[9px] text-brand-ink-2">
          {ticks.map((t) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${100 - (t / max) * 100}%` }}>
              {t}
            </span>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex h-[120px] items-end gap-1 border-b border-brand-line">
            {chart.bars.map((b) => (
              <span key={b.label} title={`${b.label}: ${b.value}`} className={cn("flex-1 rounded-t-[2px]", b.label === chart.highlight ? "bg-brand-ink" : "bg-[#CFCAC0]")} style={{ height: `${(b.value / max) * 100}%` }} />
            ))}
          </div>
          <div className="flex gap-1 font-brand-mono text-[9px] text-brand-ink-2">
            {chart.bars.map((b, i) => (
              <span key={b.label} className="flex-1 text-center">
                {i % 2 === 0 || b.label === chart.highlight ? b.label : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
      {chart.source && <span className="text-[12px] text-brand-ink-2">{chart.source}</span>}
    </figure>
  );
}
