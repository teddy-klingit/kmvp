import Link from "next/link";
import { getPortalViewer } from "@/lib/current-viewer";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ds/page-header";
import { clientVisible, STATUS_LABEL } from "@/lib/opportunities";
import { byScore, formatAmount, opportunityViews, trackRecord } from "@/lib/opportunity-view";
import { marketingPm } from "@/lib/contact-person";
import { askForOpportunityAction } from "@/lib/actions/opportunity-actions";
import { OpportunityCard, OutcomePill } from "@/components/portal/opportunities/opportunity-card";
import { cn } from "@/lib/utils";

const TABS = ["new", "considering", "in_plan", "running", "result", "dismissed"] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { ...STATUS_LABEL, result: "Results" } as Record<Tab, string>;
const EMPTY: Record<Tab, string> = {
  new: "Nothing new right now. Klingit looks at your results, trends, competitors and the season every week.",
  considering: "Nothing you're considering. Open a new one to see why we suggest it.",
  in_plan: "Nothing in your plan from an opportunity yet.",
  running: "Nothing running yet. An opportunity runs once its work goes live.",
  result: "No results yet. We measure each opportunity you act on when its window ends.",
  dismissed: "Nothing set aside.",
};
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
const pill = "inline-flex h-10 items-center rounded-full border px-4 font-brand-mono text-[13px] no-underline";

/**
 * Opportunities (Phase W, design Opps): what to do next, with how well our past suggestions did. Status filters with
 * counts, sorted by impact × urgency, big cards built from insights, and the latest results.
 */
export default async function OpportunitiesPage({ searchParams }: { searchParams: Promise<{ status?: string; how?: string; ask?: string; about?: string; asked?: string; dismissed?: string }> }) {
  const q = await searchParams;
  const viewer = await getPortalViewer();
  const tab: Tab = (TABS as readonly string[]).includes(q.status ?? "") ? (q.status as Tab) : "new";
  const now = new Date();
  const [all, record, pm, about] = await Promise.all([
    prisma.opportunity.findMany({ where: clientVisible(viewer.clientId), include: { routes: { orderBy: { sortOrder: "asc" } }, insights: { include: { insight: true } } } }),
    trackRecord(viewer.clientId, now),
    marketingPm(viewer.clientId),
    // "Ask for one" from a finding on Insights: the request starts with it (only this client's).
    q.about ? prisma.insight.findFirst({ where: { id: q.about, clientId: viewer.clientId }, select: { title: true, value: true } }) : null,
  ]);
  const counts = Object.fromEntries(TABS.map((t) => [t, all.filter((o) => o.status === t).length])) as Record<Tab, number>;
  const list = all.filter((o) => o.status === tab);
  const views = await opportunityViews(viewer.clientId, list, now);
  const sorted = tab === "result" || tab === "dismissed" ? list.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()) : list.sort(byScore(views));
  const noteBy = new Map((await prisma.user.findMany({ where: { id: { in: list.flatMap((o) => (o.pmNoteByUserId ? [o.pmNoteByUserId] : [])) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const updated = all.length ? new Date(Math.max(...all.map((o) => o.createdAt.getTime()))) : null;
  const pmFirst = pm?.name.split(" ")[0] ?? null;

  return (
    <>
      <PageHeader
        eyebrow={["What to do next", updated && `Updated ${day(updated)}`, viewer.client.name].filter(Boolean).join(" · ")}
        title="Opportunities"
        actions={
          <>
            <Link href="/opportunities?how=1" className="text-[14px] text-brand-ink underline underline-offset-4">
              How opportunities work
            </Link>
            <Link href="/opportunities?ask=1" className={cn(pill, "border-brand-ink bg-white text-brand-ink")}>
              Ask for an opportunity
            </Link>
          </>
        }
      />

      {q.how && (
        <section aria-label="How opportunities work" className="flex flex-col gap-3 rounded-[12px] bg-white px-6 py-5 text-[14px] leading-[1.55]">
          <h2 className="m-0 text-[18px] font-normal">How opportunities work</h2>
          <p className="m-0 max-w-[70ch]">Every week Klingit reads your results, the market and your Planner. What it finds shows in Insights; when a few findings point the same way, they become an opportunity, with what to do, what it should bring and by when to decide.</p>
          <p className="m-0 max-w-[70ch]">The numbers are worked out from your own data, never guessed. Confidence goes up with more data and with sources that agree, and down when a source is disconnected.</p>
          <p className="m-0 max-w-[70ch]">When you act on one, we write down what we expect. When its window ends, we measure what it brought and show it here: beat, met or missed. Saying “not for us” tells us what to suggest next.</p>
          <Link href="/opportunities" className="self-start text-[13px] text-brand-ink-2 underline underline-offset-4">
            Close
          </Link>
        </section>
      )}
      {q.ask && (
        <form action={askForOpportunityAction} aria-label="Ask for an opportunity" className="flex flex-col gap-3 rounded-[12px] bg-white px-6 py-5">
          <label htmlFor="what" className="text-[18px]">
            What should we look into?
          </label>
          <textarea id="what" name="what" rows={3} required defaultValue={about ? `About “${about.title}” (${about.value}): ` : undefined} placeholder="e.g. Anything we could do around the spring launch in Norway?" className="w-full max-w-[70ch] rounded-[10px] border border-brand-outline bg-white px-3 py-2 text-[14px]" />
          <span className="flex flex-wrap items-center gap-3">
            <button type="submit" className={cn(pill, "border-brand-ink bg-brand-ink text-white")}>
              Send to {pmFirst ?? "Klingit"}
            </button>
            <Link href="/opportunities" className="text-[13px] text-brand-ink-2 underline underline-offset-4">
              Cancel
            </Link>
          </span>
        </form>
      )}
      {q.asked && <p className="m-0 text-[14px] text-brand-ink-2">Sent to {pmFirst ?? "Klingit"}. You&apos;ll get the reply in Messages.</p>}
      {q.dismissed && <p className="m-0 text-[14px] text-brand-ink-2">Set aside. Thanks, that helps us suggest better.</p>}

      <section aria-label="Track record, last 6 months" className="grid grid-cols-2 gap-6 rounded-[12px] bg-brand-ink px-6 py-5 text-white min-[900px]:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))]">
        <p className="col-span-2 m-0 flex flex-col gap-1 min-[900px]:col-span-1">
          <span className="font-brand-mono text-[11px] uppercase tracking-[0.06em] text-white/70">Track record · last 6 months</span>
          <span className="text-[15px] leading-[1.4]">We check every opportunity you act on against what we predicted.</span>
        </p>
        {[
          { n: String(record.suggested), l: "suggested" },
          { n: String(record.actedOn), l: "acted on" },
          { n: record.measured ? `${record.metOrBeat} of ${record.measured}` : "None yet", l: "met or beat our estimate" },
          { n: record.revenue ? `+${formatAmount(record.revenue.value, "money", record.revenue.currency)}` : "None yet", l: "revenue from them" },
        ].map((s) => (
          <p key={s.l} className="m-0 flex flex-col gap-1">
            <span className="text-[28px] font-light leading-none tabular-nums">{s.n}</span>
            <span className="text-[12px] text-white/70">{s.l}</span>
          </p>
        ))}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <Link key={t} href={t === "new" ? "/opportunities" : `/opportunities?status=${t}`} aria-current={tab === t ? "page" : undefined} className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[14px] no-underline", tab === t ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline bg-white text-brand-ink hover:border-brand-ink")}>
            {TAB_LABEL[t]}
            <span className={cn("text-[12px]", tab === t ? "text-white/70" : "text-brand-ink-2")}>{counts[t]}</span>
          </Link>
        ))}
        <span className="ml-auto text-[13px] text-brand-ink-2">{tab === "result" || tab === "dismissed" ? "Latest first" : "Sorted by impact × urgency"}</span>
      </div>

      <div className="flex flex-col gap-6">
        {sorted.length === 0 ? (
          <p className="m-0 rounded-[12px] bg-white px-6 py-8 text-[15px] text-brand-ink-2">{EMPTY[tab]}</p>
        ) : (
          sorted.map((o, i) => <OpportunityCard key={o.id} o={o} v={views.get(o.id)!} rank={i + 1} pmNoteBy={o.pmNoteByUserId ? (noteBy.get(o.pmNoteByUserId) ?? null) : null} />)
        )}
      </div>

      {record.recent.length > 0 && (
        <section aria-label="Recent results" className="overflow-hidden rounded-[12px] bg-white">
          <header className="flex items-center gap-3 border-b border-brand-line px-6 py-4">
            <h2 className="m-0 flex-1 text-[18px] font-normal">Recent results</h2>
            <Link href="/opportunities?status=result" className="font-brand-mono text-[12px] uppercase text-brand-ink underline underline-offset-4">
              All {record.results} results
            </Link>
          </header>
          <ul className="m-0 list-none p-0">
            {record.recent.map((r) => (
              <li key={r.id} className="grid grid-cols-1 gap-x-6 gap-y-1 border-t border-brand-line px-6 py-3 text-[14px] first:border-t-0 sm:grid-cols-[minmax(0,1fr)_170px_150px_70px] sm:items-center">
                <Link href={`/opportunities/${r.id}`} className="text-brand-ink no-underline hover:underline">
                  {r.title}
                </Link>
                <span className="text-brand-ink-2">Expected {r.prediction?.text ?? "not estimated"}</span>
                <span>
                  Got <b className="font-semibold">{r.result.text}</b>
                </span>
                <OutcomePill outcome={r.result.outcome} />
              </li>
            ))}
          </ul>
          {record.learning && <p className="m-0 border-t border-brand-line px-6 py-3 text-[12px] text-brand-ink-2">Misses teach us too: {record.learning}</p>}
        </section>
      )}
    </>
  );
}
