import { X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { parseRange } from "@/lib/insights/daily";
import { brandLabel, competitorLimit, loadCompetitorsTab } from "@/lib/insights/market-tabs";
import { tabFindings } from "@/lib/insight-records";
import { hrefAliases } from "@/lib/insights/tabs";
import { answerCard, type Signal } from "@/lib/insights/short-answer";
import { entitlements } from "@/lib/entitlements";
import { marketingPm } from "@/lib/contact-person";
import { addSuggestedCompetitorAction, dismissSuggestedCompetitorAction, removeCompetitorAction, trackCompetitorAction } from "@/lib/actions/market-intelligence-actions";
import { pillClass } from "@/components/ds/button";
import { BlindSpots, Card, ShortAnswer, WhatWeFound, type BlindSpot } from "@/components/insights/tab-parts";
import { WORK_TZ } from "@/lib/working-hours";
import { cn } from "@/lib/utils";

const BLUE = "#5B6FB0";
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short" }).format(d);
const ord = (n: number) => (n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`);
/** A move's headline, short enough for a table cell. */
/** "2 new products and a price cut" from the moves' type tags. */
function moveSummary(kinds: string[]) {
  const counts = [...new Set(kinds)].map((k) => {
    const n = kinds.filter((x) => x === k).length;
    const noun = k.toLowerCase();
    return n === 1 ? `a ${noun}` : `${n} ${noun.replace(/(product|cut|campaign)$/, "$1s")}`;
  });
  return (counts.length > 1 ? `${counts.slice(0, -1).join(", ")} and ${counts.at(-1)}` : counts[0] ?? "").replace(/^./, (c) => c.toUpperCase());
}

const shortMove = (title: string, brand: string) => title.replace(new RegExp(`^${brandLabel(brand).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*(\\(demo\\))?\\s*`, "i"), "").replace(/^./, (c) => c.toUpperCase());

/**
 * Insights → Competitors (Phase X v2, Ins4Competitors): "What are competitors doing, and are we ahead or behind?" The
 * short answer, you vs them (share of AI answers, Google visibility, ads live, latest move), who AI assistants
 * recommend (Enterprise), what they advertise, their latest moves, findings, blind spots and Edit competitors.
 */
export default async function CompetitorsPage({ searchParams }: { searchParams: Promise<{ range?: string; edit?: string }> }) {
  const q = await searchParams;
  const days = parseRange(q.range);
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const [t, findings, pm, ent, suggestions] = await Promise.all([
    loadCompetitorsTab(clientId, { days }),
    tabFindings(clientId, hrefAliases("/insights/competitors")),
    marketingPm(clientId),
    entitlements(clientId),
    prisma.suggestedCompetitor.findMany({ where: { clientId, status: "NEW" }, orderBy: { createdAt: "desc" }, take: 3 }),
  ]);
  const pmFirst = pm?.name.split(" ")[0] ?? "Klingit";
  const ai = ent.has("aiAnswerTracking");
  const limit = competitorLimit(ent.tier);
  const own = t.table[0];
  const leader = [...t.table].filter((r) => !r.own && r.aiShare !== null).sort((a, b) => b.aiShare! - a.aiShare!)[0];
  const onPrice = t.table.find((r) => !r.own && r.move && /%|price|discount|sale|off\b/i.test(r.move.title));

  const leads = ai && leader && own.aiShare !== null && leader.aiShare! > own.aiShare;
  const moves = t.moves.length;
  const wins = ai ? t.questions.filter((x) => x.ownPosition === 1) : [];
  const signals: Signal[] = [
    ...(leads ? [{ id: "ai", status: "attention" as const, value: `${Math.round(leader.aiShare! * 100)}% vs ${Math.round(own.aiShare! * 100)}%`, label: `${brandLabel(leader.brand)} vs you, named in AI answers`, weight: 3 }] : []),
    ...(moves ? [{ id: "moves", status: "watch" as const, value: `${moves} move${moves === 1 ? "" : "s"}`, label: moveSummary(t.moves.map((m) => m.kind)), weight: 2 }] : []),
    ...(wins.length ? [{ id: "wins", status: "good" as const, value: "#1", label: `For ${wins.slice(0, 2).map((w) => `“${w.question}”`).join(" and ")}`, weight: 2.5 }] : []),
    ...(onPrice && onPrice !== leader ? [{ id: "price", status: "watch" as const, value: brandLabel(onPrice.brand), label: "Is competing on price", weight: 1 }] : []),
  ];
  const ownWord = wins[0]?.question.match(/refill|cleanser|spf|serum/i)?.[0]?.toLowerCase();
  const card = answerCard(`${clientId}:competitors:${days}`, {
    headline: !t.brands.length
      ? "Add the brands you compete with to follow what they do."
      : [leads ? `${brandLabel(leader.brand)} is pulling ahead.` : leader?.move ? `${brandLabel(leader.brand)} made the latest move.` : `You track ${t.brands.length} competitors.`, ownWord ? `You still own “${ownWord}”.` : wins.length ? "You still lead some buying questions." : null].filter(Boolean).join(" "),
    signals,
  });

  const blind: BlindSpot[] = [
    ...(t.brands.length ? [] : [{ text: "No competitors tracked yet.", action: { label: "Add competitors", href: "/insights/competitors?edit=1#edit" } }]),
    ...(ai && !t.checksInRun ? [{ text: "Who AI assistants recommend: the weekly buying questions haven't run yet.", action: null }] : []),
    ...(!ai ? [{ text: `Who AI assistants recommend, and your share of AI answers, are on ${ent.needs("aiAnswerTracking")}.`, action: { label: "See plans", href: "/settings/plan" } }] : []),
    ...(t.table.some((r) => !r.own && r.google === null) ? [{ text: "Google visibility for some competitors: their sites haven't been audited yet.", action: null }] : []),
  ];
  const maxShare = Math.max(0.01, ...t.table.map((r) => r.aiShare ?? 0));

  return (
    <div className="flex flex-col gap-6">
      <ShortAnswer card={card} sources={[...(ai && t.checksInRun ? ["AI answers"] : []), "Search Console", "Ad libraries"]} />

      <Card title="You vs your competitors" flush action={<a href="?edit=1#edit" className="font-brand-mono text-[12px] uppercase text-brand-ink underline underline-offset-4">Edit competitors</a>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[14px]">
            <thead>
              <tr className="text-left font-brand-mono text-[11px] uppercase tracking-[0.04em] text-brand-ink-2">
                {["Brand", ...(ai ? ["Named in AI answers"] : []), "Google visibility", "Ads live", "Latest move"].map((h) => (
                  <th key={h} className="px-6 py-3 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.table.map((r) => (
                <tr key={r.brand} className={cn("border-t border-brand-line", r.own && "bg-[#F6F3EC]")}>
                  <td className="whitespace-nowrap px-6 py-3.5">{r.own ? <b className="font-semibold">{r.brand} (you)</b> : brandLabel(r.brand)}</td>
                  {ai && (
                    <td className="px-6 py-3.5">
                      {r.aiShare !== null ? (
                        <span className="flex items-center gap-2 tabular-nums">
                          <span aria-hidden className="h-1.5 rounded-full" style={{ width: `${Math.max(4, (r.aiShare / maxShare) * 72)}px`, background: r.own ? "#1E1E1E" : BLUE }} />
                          {Math.round(r.aiShare * 100)}%
                        </span>
                      ) : (
                        <span className="text-brand-ink-2">Not checked yet</span>
                      )}
                    </td>
                  )}
                  <td className="px-6 py-3.5 tabular-nums">{r.google !== null ? `${r.google} / 100` : <span className="text-brand-ink-2">Not audited</span>}</td>
                  <td className="whitespace-nowrap px-6 py-3.5 tabular-nums">{r.ads ?? <span className="text-brand-ink-2">Not checked</span>}</td>
                  <td className={cn("px-6 py-3.5", r.move && "text-brand-orange-text")}>{r.move ? `${shortMove(r.move.title, r.brand)} · ${day(r.move.at)}` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          {ai && t.questions.length > 0 && (
            <Card title="Who AI assistants recommend" flush>
              <ul className="m-0 list-none p-0">
                {t.questions.slice(0, 4).map((x) => (
                  <li key={x.question} className="flex flex-col gap-2 border-b border-brand-line px-6 py-4 last:border-b-0">
                    <span className="flex items-start justify-between gap-3">
                      <span className="text-[15px]">“{x.question}”</span>
                      <span className={cn("shrink-0 text-[13px]", x.ownPosition ? "text-brand-ink-2" : "text-brand-orange-text")}>{x.ownPosition ? `You're ${ord(x.ownPosition)}` : "You're not mentioned"}</span>
                    </span>
                    {x.named.length > 0 && (
                      <span className="flex flex-wrap gap-1.5">
                        {x.named.slice(0, 4).map((b, i) => (
                          <span key={b} className={cn("rounded-full px-2.5 py-0.5 text-[12px]", b.toLowerCase() === t.brand.toLowerCase() ? "bg-brand-ink text-white" : "bg-[#F3EEE3]")}>
                            {i + 1}. {brandLabel(b)}
                          </span>
                        ))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              <p className="m-0 border-t border-brand-line px-6 py-3 text-[13px] text-brand-ink-2">
                {t.questions.length} buying question{t.questions.length === 1 ? "" : "s"} asked every week in {t.engines.map((e) => ({ chatgpt: "ChatGPT", claude: "Claude", perplexity: "Perplexity", gemini: "Gemini" })[e] ?? e).join(", ").replace(/, ([^,]*)$/, " and $1")}.
              </p>
            </Card>
          )}
          <WhatWeFound findings={findings} pm={pmFirst} />
          <BlindSpots items={blind} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {t.advertise.length > 0 && (
            <Card title="What they advertise" flush>
              <ul className="m-0 list-none p-0">
                {t.advertise.map((a) => (
                  <li key={a.brand} className="flex flex-col gap-0.5 border-b border-brand-line px-6 py-3.5 last:border-b-0">
                    <span className="text-[15px]">
                      {brandLabel(a.brand)}: “{a.theme}”
                    </span>
                    <span className="text-[12px] text-brand-ink-2">{[a.ads !== null ? `${a.ads} ad${a.ads === 1 ? "" : "s"}` : null, a.since ? `running since ${day(a.since)}` : null, a.platforms.join(" + ")].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
              <p className="m-0 border-t border-brand-line px-6 py-3 text-[12px] text-brand-ink-2">From public ad libraries. Spend and sales are not visible.</p>
            </Card>
          )}
          {t.moves.length > 0 && (
            <Card title="Their latest moves" flush>
              <ul className="m-0 list-none p-0">
                {t.moves.map((m) => (
                  <li key={m.id} className="grid grid-cols-[56px_100px_minmax(0,1fr)] gap-3 border-b border-brand-line px-6 py-3.5 text-[14px] last:border-b-0">
                    <span className="text-brand-ink-2">{day(m.at)}</span>
                    <span className="truncate">{m.brand ? brandLabel(m.brand) : ""}</span>
                    <span>{m.brand ? shortMove(m.title, m.brand) : m.title.replace(/\s*\(demo\)/gi, "")}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {(q.edit || !t.brands.length) && (
            <Card title="Edit competitors" id="edit">
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {t.brands.map((b) => (
                  <li key={b} className="flex items-center justify-between gap-3 text-[14px]">
                    {brandLabel(b)}
                    <form action={removeCompetitorAction}>
                      <input type="hidden" name="brand" value={b} />
                      <button type="submit" aria-label={`Stop tracking ${brandLabel(b)}`} className="flex size-8 items-center justify-center rounded-full text-brand-ink-2 hover:bg-brand-ink/5">
                        <X className="size-4" strokeWidth={1.75} />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
              {t.brands.length < limit ? (
                <form action={trackCompetitorAction} className="mt-4 flex gap-2">
                  <label htmlFor="track-brand" className="sr-only">
                    Brand name or website
                  </label>
                  <input id="track-brand" name="brand" required placeholder="Brand name or website" className="h-11 min-w-0 flex-1 rounded-full border border-brand-outline bg-white px-4 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" />
                  <button type="submit" className={pillClass("secondary", "sm")}>
                    Add
                  </button>
                </form>
              ) : (
                <p className="m-0 mt-4 text-[13px] text-brand-ink-2">
                  {limit} brands is the most on your plan{ent.tier !== "enterprise" ? "; Enterprise tracks 4" : ""}. Remove one to add another.
                </p>
              )}
              {suggestions.length > 0 && t.brands.length < limit && (
                <div className="mt-4 flex flex-col gap-2 border-t border-brand-line pt-4">
                  <span className="text-[13px] text-brand-ink-2">Seen often in your category</span>
                  {suggestions.map((s) => (
                    <span key={s.id} className="flex items-center gap-2 text-[14px]">
                      <span className="flex-1">{s.name}</span>
                      <form action={addSuggestedCompetitorAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <input type="hidden" name="name" value={s.name} />
                        <button type="submit" className={pillClass("secondary", "sm")}>
                          Track
                        </button>
                      </form>
                      <form action={dismissSuggestedCompetitorAction}>
                        <input type="hidden" name="id" value={s.id} />
                        <button type="submit" className="text-[13px] text-brand-ink-2 underline underline-offset-4">
                          Not a competitor
                        </button>
                      </form>
                    </span>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
