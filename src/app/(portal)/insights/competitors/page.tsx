import Link from "next/link";
import { ChevronRight, Crosshair, X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { parseRange } from "@/lib/insights/daily";
import { brandLabel, competitorLimit, loadCompetitorsTab, moveKind } from "@/lib/insights/market-tabs";
import { tabFindings } from "@/lib/insight-records";
import { hrefAliases } from "@/lib/insights/tabs";
import { answerCard, type Signal } from "@/lib/insights/short-answer";
import { entitlements } from "@/lib/entitlements";
import { marketingPm } from "@/lib/contact-person";
import { addSuggestedCompetitorAction, dismissSuggestedCompetitorAction, removeCompetitorAction, setCompetitorSiteAction, trackCompetitorAction } from "@/lib/actions/market-intelligence-actions";
import { sitesOf } from "@/lib/competitor-logo";
import { BrandMark, RankChip, monogramColor } from "@/components/insights/brand-mark";
import { Chips } from "@/components/insights/source-chip";
import { pillClass } from "@/components/ds/button";
import { BlindSpots, Card, ShortAnswer, StatTiles, StatusPill, WhatItMeans, WhatWeFound, type BlindSpot } from "@/components/insights/tab-parts";
import { WORK_TZ } from "@/lib/working-hours";
import { cn } from "@/lib/utils";

const BLUE = "#5B6FB0";
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short" }).format(d);
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

const MOVE_TONE = { "New product": "bg-[#F8EEF8] text-[#8E3A90]", "Price cut": "bg-[#FFF1E8] text-brand-orange-text", Campaign: "bg-[#EEF1FA] text-[#5B6FB0]" } as const;
function MoveTag({ kind }: { kind: keyof typeof MOVE_TONE }) {
  return <span className={cn("rounded-md px-2 py-0.5 text-[12px] font-fw-medium", MOVE_TONE[kind])}>{kind}</span>;
}

/** A number in its own column with a small bar: Medium on every row, Semibold on your own row. */
function Meter({ value, max, own, label }: { value: number; max: number; own: boolean; label: string }) {
  return (
    <span className="flex items-center gap-2.5 tabular-nums">
      <span aria-hidden className="h-1.5 w-[72px] overflow-hidden rounded-full bg-[#ECE8DF]">
        <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (value / max) * 100)}%`, background: own ? "#1E1E1E" : BLUE }} />
      </span>
      <span className={own ? "font-fw-semibold" : "font-fw-medium"}>{label}</span>
    </span>
  );
}

/** A move as a noun phrase: "launched a tinted SPF fluid" → "its tinted SPF fluid launch"; a price cut → "its price cut". */
function moveNoun(title: string, brand: string) {
  const m = shortMove(title, brand);
  const launched = m.match(/^launched (?:a |an |its )?(.+?)(?:,.*)?$/i);
  if (launched) return `its ${launched[1]} launch`;
  return moveKind(title) === "Price cut" ? "its price cut" : `its move: ${m.replace(/^./, (c) => c.toLowerCase())}`;
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
  const own = t.table.find((r) => r.own)!;
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

  const googleRank = (b: string) => [...t.table].filter((r) => r.google !== null).sort((a, b2) => b2.google! - a.google!).findIndex((r) => r.brand === b) + 1;
  const ownGoogle = googleRank(own.brand);
  const leadsBoth = leader && googleRank(leader.brand) === 1 && t.table[0]?.brand === leader.brand;
  const tableMeans =
    ai && own.aiShare !== null && ownGoogle
      ? `You’re #${own.rank} in AI answers${ownGoogle !== own.rank ? ` but #${ownGoogle} on Google` : " and on Google"}.${leader && !own.rank.toString().startsWith("1") ? ` ${brandLabel(leader.brand)} leads ${leadsBoth ? "both" : "AI answers"}${leader.move ? `, helped by ${moveNoun(leader.move.title, leader.brand)}` : ""}.` : ""}`
      : null;
  const sites = sitesOf((await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { competitorSites: true } })).competitorSites);

  const blind: BlindSpot[] = [
    ...(t.brands.length ? [] : [{ text: "No competitors tracked yet.", action: { label: "Add competitors", href: "/insights/competitors?edit=1#edit" } }]),
    ...(ai && !t.checksInRun ? [{ text: "Who AI assistants recommend: the weekly buying questions haven't run yet.", action: null }] : []),
    ...(!ai ? [{ text: `Who AI assistants recommend, and your share of AI answers, are on ${ent.needs("aiAnswerTracking")}.`, action: { label: "See plans", href: "/settings/plan" } }] : []),
    ...(t.table.some((r) => !r.own && r.google === null) ? [{ text: "Google visibility for some competitors: their sites haven't been audited yet.", action: null }] : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <ShortAnswer card={card} sources={[...(ai && t.checksInRun ? ["AI answers"] : []), "Search Console", "Ad libraries"]} />

      <Card title="You vs your competitors" titleClassName="font-fw-medium" flush action={<a href="?edit=1#edit" className="font-brand-mono text-[12px] font-fw-medium uppercase text-brand-ink underline underline-offset-4">Edit competitors</a>}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[14px]">
            <thead>
              <tr className="bg-[#FAF8F3] text-left font-brand-mono text-[11px] uppercase tracking-[0.04em] text-brand-ink-2">
                {["Rank", "Brand", ...(ai ? ["Named in AI answers"] : []), "Google visibility", "Ads live", "Latest move"].map((h) => (
                  <th key={h} className="px-5 py-3 font-normal first:pl-6">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.table.map((r) => (
                <tr key={r.brand} className={cn("border-t border-brand-line", r.own && "bg-[#F6F3EC] shadow-[inset_3px_0_0_#1E1E1E]")}>
                  <td className="px-5 py-4 pl-6 font-fw-regular tabular-nums text-brand-mute">#{r.rank}</td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <BrandMark name={brandLabel(r.brand)} logo={t.logos[r.brand]} you={r.own} nameClassName={r.own ? "font-fw-semibold" : "font-fw-medium"} />
                  </td>
                  {ai && (
                    <td className="px-5 py-4">
                      {r.aiShare !== null ? (
                        <span className="flex flex-col gap-1">
                          <Meter value={r.aiShare} max={1} own={r.own} label={`${Math.round(r.aiShare * 100)}%`} />
                          {r.vsYou !== null && r.vsYou !== 0 && <span className={cn("text-[12px] font-fw-regular", r.vsYou > 0 ? "text-brand-orange-text" : "text-[#6E7D2F]")}>{r.vsYou > 0 ? "+" : "−"}{Math.abs(r.vsYou)} vs you</span>}
                        </span>
                      ) : (
                        <span className="text-brand-ink-2">Not checked yet</span>
                      )}
                    </td>
                  )}
                  <td className="px-5 py-4">{r.google !== null ? <Meter value={r.google} max={100} own={r.own} label={String(r.google)} /> : <span className="text-brand-ink-2">Not audited</span>}</td>
                  <td className={cn("whitespace-nowrap px-5 py-4 tabular-nums", r.own ? "font-fw-semibold" : "font-fw-medium")}>{r.ads ?? <span className="font-fw-regular text-brand-ink-2">Not checked</span>}</td>
                  <td className="px-5 py-4">
                    {r.move ? (
                      <span className="flex flex-col gap-1">
                        <span className="flex items-center gap-2">
                          <MoveTag kind={r.move.kind} />
                          <span className="text-[12px] font-fw-regular text-brand-mute">{day(r.move.at)}</span>
                        </span>
                        <span className="font-fw-regular">{shortMove(r.move.title, r.brand)}</span>
                      </span>
                    ) : (
                      <span className="font-fw-regular text-brand-mute">No change</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {tableMeans && <WhatItMeans className="mt-2">{tableMeans}</WhatItMeans>}
      </Card>

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          {ai && t.questions.length > 0 && (
            <Card title="Who AI assistants recommend" flush>
              <div className="flex flex-col gap-3 px-6 pb-2 pt-5">
                <StatTiles
                  items={[
                    { value: String(t.answers.win), label: `question${t.answers.win === 1 ? "" : "s"} you win`, tone: "good" },
                    { value: String(t.answers.top3), label: "where you’re top 3", tone: "neutral" },
                    { value: String(t.answers.notNamed), label: "where you’re not named", tone: t.answers.notNamed ? "bad" : "neutral" },
                  ]}
                />
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-brand-ink-2">
                  {[t.brand, ...t.brands].map((b) => (
                    <BrandMark key={b} name={brandLabel(b)} logo={t.logos[b]} you={b === t.brand} size={14} className="gap-1" nameClassName="font-normal" />
                  ))}
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] border-collapse text-[14px]">
                  <thead>
                    <tr className="bg-[#FAF8F3] text-left font-brand-mono text-[11px] uppercase tracking-[0.04em] text-brand-ink-2">
                      <th className="px-6 py-3 font-normal">Buying question</th>
                      <th className="px-3 py-3 font-normal">You</th>
                      <th className="px-6 py-3 font-normal">Named, in order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {t.questions.slice(0, 4).map((x) => (
                      <tr key={x.question} className="border-t border-brand-line align-middle">
                        <td className="px-6 py-3.5">“{x.question}”</td>
                        <td className="px-3 py-3.5">{x.ownPosition === null ? <StatusPill tone="bad" icon={false}>Not named</StatusPill> : <StatusPill tone={x.ownPosition === 1 ? "good" : "neutral"} icon={false}>#{x.ownPosition}</StatusPill>}</td>
                        <td className="px-6 py-3.5">
                          <span className="flex flex-wrap gap-1">
                            {x.named.slice(0, 4).map((b, i) => (
                              <RankChip key={b} name={brandLabel(b)} logo={t.logos[t.brands.find((k) => k.toLowerCase() === b.toLowerCase()) ?? b]} rank={i + 1} you={b.toLowerCase() === t.brand.toLowerCase()} />
                            ))}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="m-0 border-t border-brand-line px-6 py-3 text-[13px] text-brand-ink-2">
                {t.questions.length} buying question{t.questions.length === 1 ? "" : "s"}, asked every week in {t.engines.map((e) => ({ chatgpt: "ChatGPT", claude: "Claude", perplexity: "Perplexity", gemini: "Gemini" })[e] ?? e).join(", ").replace(/, ([^,]*)$/, " and $1")}.
              </p>
            </Card>
          )}
          <WhatWeFound findings={findings} pm={pmFirst} />
          <BlindSpots items={blind} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {t.moves.length > 0 && (
            <Card title="Their latest moves" flush>
              <ol className="m-0 list-none p-0 py-2">
                {t.moves.map((m, i) => (
                  <li key={m.id} className="grid grid-cols-[52px_14px_minmax(0,1fr)] gap-x-3 px-6 py-3">
                    <span className="pt-0.5 text-[13px] text-brand-ink-2">{day(m.at)}</span>
                    <span className="relative flex justify-center" aria-hidden>
                      <span className="z-10 mt-1.5 size-2.5 rounded-full bg-brand-ink" />
                      {i < t.moves.length - 1 && <span className="absolute bottom-[-24px] top-3 w-px bg-brand-line" />}
                    </span>
                    <span className="flex min-w-0 flex-col gap-2">
                      <span className="flex flex-wrap items-center gap-2">
                        <BrandMark name={brandLabel(m.brand!)} logo={t.logos[m.brand!]} size={20} />
                        <MoveTag kind={m.kind} />
                      </span>
                      <span className="text-[15px]">{shortMove(m.title, m.brand!)}</span>
                      {(m.forYou || m.opportunity) && (
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-[#F4F1EA] px-3 py-2.5 text-[13px]">
                          <b className="font-fw-semibold">For you:</b>
                          <span className="min-w-0 flex-1 basis-[140px]">{m.forYou ?? "It feeds an opportunity."}</span>
                          {m.opportunity && (
                            <Link href={`/opportunities/${m.opportunity.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-[#F5C9B0] bg-[#FFF4EE] px-3 py-1 text-[12px] text-brand-ink no-underline hover:border-brand-orange">
                              <Crosshair className="size-3" strokeWidth={2} /> {m.opportunity.title} <ChevronRight className="size-3" />
                            </Link>
                          )}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </Card>
          )}
          {t.advertise.length > 0 && (
            <Card title="What they advertise" flush>
              <ul className="m-0 list-none p-0">
                {t.advertise.map((a) => (
                  <li key={a.brand} className="flex gap-4 border-b border-brand-line px-6 py-4 last:border-b-0">
                    <span aria-hidden className="size-14 shrink-0 rounded-lg" style={{ background: `linear-gradient(135deg, ${monogramColor(a.brand)}33, #F6EFE6 60%, ${monogramColor(a.brand)}22)` }} />
                    <span className="flex min-w-0 flex-col gap-1.5">
                      <span className="flex flex-wrap items-center gap-2 text-[13px]">
                        <BrandMark name={brandLabel(a.brand)} logo={t.logos[a.brand]} size={18} />
                        <StatusPill tone={a.tag === "Discount" ? "bad" : a.tag === "Sustainability" ? "good" : "watch"} icon={false}>
                          {a.tag}
                        </StatusPill>
                      </span>
                      <span className="text-[17px] font-fw-regular">“{a.theme}”</span>
                      <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-brand-ink-2">
                        {a.ads !== null && <span className="rounded-full bg-brand-chip px-2 py-0.5">{a.ads} ads</span>}
                        <Chips sources={a.platforms} />
                        {a.since && <span>since {day(a.since)}</span>}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="m-0 border-t border-brand-line px-6 py-3 text-[12px] text-brand-ink-2">From public ad libraries. Their spend and sales are not visible.</p>
            </Card>
          )}
          {(q.edit || !t.brands.length) && (
            <Card title="Edit competitors" id="edit">
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {t.brands.map((b) => (
                  <li key={b} className="flex flex-wrap items-center gap-3 text-[14px]">
                    <BrandMark name={brandLabel(b)} logo={t.logos[b]} className="flex-1" />
                    <form action={setCompetitorSiteAction} className="flex items-center gap-1.5">
                      <input type="hidden" name="brand" value={b} />
                      <label htmlFor={`site-${b}`} className="sr-only">
                        Website for {brandLabel(b)}
                      </label>
                      <input id={`site-${b}`} name="website" defaultValue={sites[b.toLowerCase()]?.domain ?? ""} placeholder="Website, for the logo" className="h-9 w-[180px] rounded-full border border-brand-outline bg-white px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" />
                      <button type="submit" className="h-9 rounded-full px-3 font-brand-mono text-[12px] text-brand-ink underline underline-offset-4">
                        Save
                      </button>
                    </form>
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
                <form action={trackCompetitorAction} className="mt-4 flex flex-wrap gap-2">
                  <label htmlFor="track-brand" className="sr-only">
                    Brand name or website
                  </label>
                  <input id="track-brand" name="brand" required placeholder="Brand name" className="h-11 min-w-0 flex-1 rounded-full border border-brand-outline bg-white px-4 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" />
                  <label htmlFor="track-site" className="sr-only">
                    Website (optional)
                  </label>
                  <input id="track-site" name="website" placeholder="Website (optional)" className="h-11 min-w-0 flex-1 rounded-full border border-brand-outline bg-white px-4 text-[14px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" />
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
