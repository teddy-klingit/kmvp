import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, Check, ChevronLeft } from "lucide-react";
import { getPortalViewer } from "@/lib/current-viewer";
import { prisma } from "@/lib/prisma";
import { jsonArray, cn } from "@/lib/utils";
import { pillClass } from "@/components/ds/button";
import { loadLeadTimes } from "@/lib/plan";
import { clientVisible, COMBINED_DISMISS_REASONS, DISMISS_REASONS, KINDS, markViewed, routeCost, STATUS_LABEL, STATUSES, type RouteCheck } from "@/lib/opportunities";
import { measurementPlan, opportunityViews, resultOf, predictionOf, formatAmount } from "@/lib/opportunity-view";
import type { Combined } from "@/lib/combined";
import { addCombinedToPlanAction, briefRouteAction, dismissOpportunityAction } from "@/lib/actions/opportunity-actions";
import { AnotherRoute } from "@/components/portal/plan/ask-for-more";
import { OpportunityAdd } from "@/components/portal/plan/opportunity-add";
import { ConfidencePill, OutcomePill, PmNote, wday } from "@/components/portal/opportunities/opportunity-card";
import { InsightCard } from "@/components/insights/insight-card";
import { MessagePmButton } from "@/components/pm-panel/pm-panel-provider";
import { marketingPm } from "@/lib/contact-person";

const NUMBER = ["No", "One", "Two", "Three", "Four", "Five"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(d);
const card = "overflow-hidden rounded-[12px] bg-white";
const h2 = "m-0 border-b border-brand-line px-6 py-4 text-[18px] font-normal";
const action = "inline-flex h-10 w-full items-center justify-center rounded-full border px-4 font-brand-mono text-[12px] no-underline";

/**
 * One opportunity (Phase W, design OppDetail): kind, sources, confidence and where it is (New → Considering → In plan
 * → Running → Result). Then the chain on one panel: what we noticed (the insights, each linking to where it lives),
 * what it means, what to do. Below: how we got the number, how we'll measure it, the PM's note, data checks, and Not
 * for us. Opening it as the client makes a new one Considering.
 */
export default async function OpportunityPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ route?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const viewer = await getPortalViewer();
  await markViewed(viewer.clientId, id);
  const o = await prisma.opportunity.findFirst({ where: { id, ...clientVisible(viewer.clientId) }, include: { routes: { orderBy: { sortOrder: "asc" } }, insights: { include: { insight: true } } } });
  if (!o) notFound();
  const now = new Date();
  const v = (await opportunityViews(viewer.clientId, [o], now)).get(o.id)!;
  const combined = o.combined as unknown as Combined | null;
  const picked = o.routes.find((r) => r.letter === q.route) ?? o.routes.find((r) => r.status !== "new" && r.status !== "dismissed") ?? o.routes[0] ?? null;
  const [pm, measure, leadTimes, skill, noteBy, item] = await Promise.all([
    marketingPm(viewer.clientId),
    measurementPlan(o, v),
    loadLeadTimes(),
    o.skillKey ? prisma.agent.findUnique({ where: { key: o.skillKey }, select: { id: true, name: true, availability: true } }) : null,
    o.pmNoteByUserId ? prisma.user.findUnique({ where: { id: o.pmNoteByUserId }, select: { name: true } }) : null,
    combined?.actions.addToPlan ? prisma.clientCalendarItem.findFirst({ where: { id: combined.actions.addToPlan.planItemId, clientId: viewer.clientId }, select: { title: true, date: true, endDate: true } }) : null,
  ]);
  const pmFirst = pm?.name.split(" ")[0] ?? null;
  const sources = [...new Set(v.insights.flatMap((i) => jsonArray<string>(i.sources)))];
  const open = o.status === "new" || o.status === "considering";
  const result = resultOf(o);
  const prediction = predictionOf(o);
  const step = o.status === "dismissed" ? -1 : STATUSES.indexOf(o.status as (typeof STATUSES)[number]);
  const welcome = v.insights.some((i) => i.key === "combined:welcome-repeat");

  // What to do: the client's next moves, the main one in orange (it's their action).
  const doCards: { title: string; text: string; cta: React.ReactNode }[] = [];
  if (open && combined?.actions.addToPlan)
    doCards.push({
      title: `Add Story ads to ${item?.title ?? "the plan"}`,
      text: `Into your Planner on ${item ? (item.endDate && item.endDate.toDateString() !== item.date.toDateString() ? `${day(item.date)}–${day(item.endDate)}` : day(item.date)) : "its date"}, marked “Klingit's help”`,
      cta: (
        <form action={addCombinedToPlanAction}>
          <input type="hidden" name="id" value={o.id} />
          <button type="submit" className={cn(action, "border-brand-orange bg-brand-orange text-white")}>
            Add to Planner
          </button>
        </form>
      ),
    });
  else if (open && picked)
    doCards.push({
      title: `Add “${picked.name}” to your Planner`,
      text: o.windowStart || o.windowEnd ? `Prefilled for ${day((o.windowEnd ?? o.windowStart)!)}, with its formats and channels` : "Prefilled with its formats and channels",
      cta: (
        <Link href={`/opportunities/${o.id}?route=${picked.letter}#add`} scroll={false} className={cn(action, "border-brand-orange bg-brand-orange text-white")}>
          Add to Planner
        </Link>
      ),
    });
  if (combined)
    doCards.push({
      title: combined.actions.brief.label,
      text: [combined.cost.credits ? `≈ ${combined.cost.credits} creative credits` : null, v.decideBy ? `brief by ${wday(v.decideBy)}` : null].filter(Boolean).join(" · "),
      cta: (
        <Link href={combined.actions.brief.href} className={cn(action, "border-brand-ink bg-white text-brand-ink")}>
          Start the brief
        </Link>
      ),
    });
  else if (picked)
    doCards.push({
      title: `Brief Klingit: ${picked.name}`,
      text: [routeCost(picked) || null, v.decideBy ? `brief by ${wday(v.decideBy)}` : null].filter(Boolean).join(" · "),
      cta: (
        <form action={briefRouteAction}>
          <input type="hidden" name="id" value={o.id} />
          <input type="hidden" name="route" value={picked.letter} />
          <button type="submit" className={cn(action, "border-brand-ink bg-white text-brand-ink")}>
            Start the brief
          </button>
        </form>
      ),
    });
  if (skill && skill.availability === "self_service")
    doCards.push({
      title: `Make it yourself with ${skill.name}`,
      text: "A skill, on your AI credits",
      cta: (
        <Link href={`/skills/${skill.id}?say=${encodeURIComponent(`${o.title}${picked?.sampleLine ? `. Like: ${picked.sampleLine}` : ""}`)}`} className={cn(action, "border-brand-ink bg-white text-brand-ink")}>
          Run the skill
        </Link>
      ),
    });
  if (pmFirst)
    doCards.push({
      title: welcome ? "Check the welcome flow covers Story buyers" : `Talk it through with ${pmFirst}`,
      text: welcome ? `A Klaviyo setting. ${pmFirst} can check it with you.` : `Your Marketing PM can go through the numbers with you.`,
      cta: <MessagePmButton className={cn(action, "border-brand-ink bg-white text-brand-ink")}>{`Ask ${pmFirst}`}</MessagePmButton>,
    });

  return (
    <div className="flex flex-col gap-6">
      <Link href="/opportunities" className="-mt-2 inline-flex items-center gap-1 self-start text-[13px] text-brand-ink-2 no-underline hover:text-brand-ink">
        <ChevronLeft className="size-3.5" /> Opportunities
      </Link>

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <span className="flex flex-1 flex-wrap items-center gap-3">
            <span className="font-brand-mono text-[12px] uppercase tracking-[0.06em] text-brand-ink-2">
              {[KINDS[v.kind], v.tag, `From ${sources.length} source${sources.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}
            </span>
            <ConfidencePill confidence={v.confidence} />
          </span>
          <ol aria-label="Status" className="m-0 flex list-none flex-wrap items-center gap-1.5 p-0">
            {o.status === "dismissed" ? (
              <li className="rounded-full bg-brand-ink px-3 py-1 text-[12px] text-white">{STATUS_LABEL.dismissed}</li>
            ) : (
              STATUSES.map((s, i) => (
                <li key={s} className="flex items-center gap-1.5" aria-current={i === step ? "step" : undefined}>
                  {i > 0 && <span aria-hidden className="h-px w-3 bg-brand-outline" />}
                  <span className={cn("rounded-full border px-3 py-1 text-[12px]", i === step ? "border-brand-ink bg-brand-ink text-white" : i < step ? "border-brand-outline bg-white text-brand-ink" : "border-brand-line bg-transparent text-brand-ink-2")}>{STATUS_LABEL[s]}</span>
                </li>
              ))
            )}
          </ol>
        </div>
        <h1 className="m-0 max-w-[46ch] text-[36px] font-light leading-[1.15] [text-wrap:balance]">{o.title}</h1>
      </header>

      {/* The chain: noticed → means → do. */}
      <section aria-label="Why, and what to do" className="grid grid-cols-1 gap-5 rounded-[16px] bg-[#EFEBE1] p-5 min-[1100px]:grid-cols-[minmax(0,1fr)_16px_minmax(0,1fr)_16px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <h2 className="m-0 font-brand-mono text-[11px] font-normal uppercase tracking-[0.06em] text-brand-ink-2">1 · What we noticed</h2>
          {v.insights.map((i) => (
            <InsightCard key={i.id} insight={i} />
          ))}
        </div>
        <ArrowRight aria-hidden className="hidden size-4 self-start text-brand-ink-2 min-[1100px]:mt-8 min-[1100px]:block" />
        <div className="flex min-w-0 flex-col gap-3">
          <h2 className="m-0 font-brand-mono text-[11px] font-normal uppercase tracking-[0.06em] text-brand-ink-2">2 · What it means</h2>
          <div className="flex flex-col gap-4 rounded-[12px] bg-brand-ink px-5 py-5 text-white">
            <p className="m-0 text-[18px] leading-[1.4]">{combined?.meaning?.why ?? o.summary}</p>
            {(combined?.meaning?.move ?? picked?.description) && <p className="m-0 text-[14px] leading-[1.5] text-white/75">{combined?.meaning?.move ?? `${picked!.name}: ${picked!.description}`}</p>}
            <dl className="m-0 grid grid-cols-2 gap-4 border-t border-white/15 pt-4">
              <div className="flex flex-col gap-1">
                <dt className="text-[12px] text-white/60">Expected</dt>
                <dd className="m-0 text-[20px] font-light">{v.estimate.low !== null ? v.estimate.text.replace(/ in \d+ days$/, "") : v.estimate.text}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="text-[12px] text-white/60">Decide by</dt>
                <dd className="m-0 text-[20px] font-light">{v.decideBy ? wday(v.decideBy) : "Any time"}</dd>
              </div>
            </dl>
          </div>
          {v.warning && (
            <p className="m-0 flex items-start gap-2 rounded-[10px] bg-white px-4 py-3 text-[13px] leading-[1.45] text-[#B42318]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} /> {v.warning}
            </p>
          )}
        </div>
        <ArrowRight aria-hidden className="hidden size-4 self-start text-brand-ink-2 min-[1100px]:mt-8 min-[1100px]:block" />
        <div className="flex min-w-0 flex-col gap-3">
          <h2 className="m-0 font-brand-mono text-[11px] font-normal uppercase tracking-[0.06em] text-brand-ink-2">3 · What to do</h2>
          {!open && (
            <p className="m-0 rounded-[12px] bg-white px-5 py-4 text-[14px]">
              {o.status === "dismissed" ? `Set aside: “${o.dismissReason}”.` : o.status === "in_plan" ? "It's in your Planner." : o.status === "running" ? "It's running. We'll measure it when the window ends." : "Done, and measured."}
            </p>
          )}
          {doCards.map((c) => (
            <div key={c.title} className="flex flex-col gap-3 rounded-[12px] bg-white px-5 py-4">
              <span className="flex flex-col gap-1">
                <span className="text-[15px]">{c.title}</span>
                {c.text && <span className="text-[12px] text-brand-ink-2">{c.text}</span>}
              </span>
              {c.cta}
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          {result && (
            <section aria-label="Result" className={card}>
              <h2 className={h2}>Result</h2>
              <div className="flex flex-wrap items-center gap-4 px-6 py-5 text-[15px]">
                <span className="text-brand-ink-2">Expected {prediction?.text ?? "not estimated"}</span>
                <span>
                  Got <b className="font-semibold">{result.text}</b>
                </span>
                <OutcomePill outcome={result.outcome} />
              </div>
              {result.outcome === "missed" && o.learning && o.learningStatus === "approved" && <p className="m-0 border-t border-brand-line px-6 py-3 text-[13px] text-brand-ink-2">What we learned: {o.learning}</p>}
            </section>
          )}
          <section aria-label="How we got the number" className={card}>
            <h2 className={h2}>How we got the number</h2>
            <div className="flex flex-col gap-3 px-6 py-5 text-[14px] leading-[1.6]">
              {combined ? (
                <>
                  {combined.maths.map((m) => (
                    <p key={m.label} className="m-0">
                      <b className="font-semibold">{m.label}:</b> {m.text}
                    </p>
                  ))}
                  <p className="m-0 text-[13px] text-brand-ink-2">{combined.mathsNote}</p>
                  {combined.disagree && (
                    <p className="m-0 rounded-[10px] bg-brand-page px-4 py-3 text-[13px]">
                      {combined.disagree.text}: {combined.disagree.a.source} {Math.round(combined.disagree.a.value).toLocaleString("en-GB")}, {combined.disagree.b.source} {Math.round(combined.disagree.b.value).toLocaleString("en-GB")}. We use {combined.disagree.b.source}&apos;s count and show both.
                    </p>
                  )}
                </>
              ) : v.estimate.maths.length ? (
                v.estimate.maths.map((m) => (
                  <p key={m} className="m-0">
                    {m}
                  </p>
                ))
              ) : (
                <p className="m-0 text-brand-ink-2">No number yet: {v.estimate.unclear}. We won&apos;t guess one.</p>
              )}
            </div>
          </section>
          <section aria-label="How we'll measure it" className={card}>
            <h2 className={h2}>How we&apos;ll measure it</h2>
            <div className="flex flex-col gap-2 px-6 py-5 text-[14px] leading-[1.6]">
              <p className="m-0">{measure.text}</p>
              {measure.ready && <p className="m-0 text-[13px] text-brand-ink-2">{measure.ready}</p>}
              {prediction && result && (
                <p className="m-0 text-[13px] text-brand-ink-2">
                  Measured: {formatAmount(result.actual, result.unit, result.currency, result.label)} against {prediction.text}.
                </p>
              )}
            </div>
          </section>
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {o.pmNote && (
            <section aria-label="From your Marketing PM" className={card}>
              <h2 className={h2}>From your Marketing PM</h2>
              <div className="flex flex-col gap-1 px-6 py-5">
                <PmNote note={o.pmNote} by={noteBy?.name ?? null} />
                {o.pmNoteAt && <span className="pl-1 text-[12px] text-brand-ink-2">{day(o.pmNoteAt)}</span>}
              </div>
            </section>
          )}
          <section aria-label="Data checks" className={card}>
            <h2 className={h2}>Data checks</h2>
            <ul className="m-0 flex list-none flex-col gap-3 px-6 py-5 text-[14px]">
              {v.checks.map((x) => (
                <li key={x.text} className="flex items-start gap-2">
                  {x.ok ? <Check className="mt-0.5 size-4 shrink-0 text-[#8D9E47]" strokeWidth={2.5} /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[#B42318]" strokeWidth={2} />}
                  {x.text}
                </li>
              ))}
            </ul>
          </section>
          {o.status !== "dismissed" && o.status !== "result" && (
            <section aria-label="Not for us?" className={card}>
              <h2 className={h2}>Not for us?</h2>
              <div className="flex flex-col gap-3 px-6 py-5">
                <p className="m-0 text-[13px] text-brand-ink-2">Tell us why, and the next suggestions get better.</p>
                <span className="flex flex-wrap gap-2">
                  {(combined ? [...COMBINED_DISMISS_REASONS, "Off-brand"] : DISMISS_REASONS).map((reason) => (
                    <form key={reason} action={dismissOpportunityAction}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="reason" value={reason} />
                      <input type="hidden" name="back" value="1" />
                      <button type="submit" className="h-9 rounded-full border border-[#CFC8B8] bg-white px-3.5 text-[13px] hover:border-brand-ink">
                        {reason}
                      </button>
                    </form>
                  ))}
                </span>
                <span className="text-[11px] text-brand-ink-2">“Don&apos;t trust the data” goes to your Marketing PM, who&apos;ll check the numbers with you.</span>
              </div>
            </section>
          )}
        </div>
      </div>

      {!combined && o.routes.length > 0 && (
        <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <section aria-label="Ways to do it" className={card}>
            <h2 className="m-0 flex flex-wrap items-baseline gap-2 border-b border-brand-line px-6 py-4 text-[18px] font-normal">
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
                  <li key={r.id} className={cn("grid grid-cols-1 gap-4 border-b border-brand-line px-6 py-5 last:border-b-0 min-[760px]:grid-cols-[minmax(0,1fr)_230px]", on && "border-l-[3px] border-l-brand-ink bg-[#FBF9F4] pl-[21px]")}>
                    <div className="flex min-w-0 gap-3">
                      <Link href={`/opportunities/${o.id}?route=${r.letter}#add`} scroll={false} aria-label={`Pick route ${r.letter}`} aria-current={on ? "true" : undefined} className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", on ? "border-brand-ink" : "border-brand-outline")}>
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
                          {[...jsonArray<string>(r.formats).map((f) => ({ t: f, c: "bg-brand-chip" })), ...jsonArray<string>(r.channels).map((c) => ({ t: c, c: "bg-[#E6ECF5]" }))].map((x) => (
                            <span key={x.t} className={cn("rounded-full px-2 py-0.5 text-[12px]", x.c)}>
                              {x.t}
                            </span>
                          ))}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      {r.sampleLine && (
                        <figure className="m-0 flex flex-col gap-1 rounded-[8px] bg-[#FBF6EE] px-3.5 py-3">
                          <blockquote className="m-0 font-serif text-[16px] leading-[1.4]">{r.sampleLine}</blockquote>
                          {check && !check.ok && <figcaption className="text-[11px] text-brand-ink-2">Fixed by the rule check: {check.violations.map((x) => x.rule).join("; ")}</figcaption>}
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
            <p className="m-0 border-t border-brand-line px-6 py-3.5 text-[12px] text-brand-ink-2">Sample lines are written in your voice and checked against your rules.</p>
          </section>
          <section id="add" aria-label="Add to Planner" className={card}>
            <h2 className={h2}>Add to Planner</h2>
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
        </div>
      )}
    </div>
  );
}
