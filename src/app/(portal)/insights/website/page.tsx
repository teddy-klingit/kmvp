import Link from "next/link";
import { getPortalViewer } from "@/lib/current-viewer";
import { parseRange } from "@/lib/insights/daily";
import { loadWebsiteTab } from "@/lib/insights/website-tab";
import { askedAbout, tabFindings } from "@/lib/insight-records";
import { hrefAliases } from "@/lib/insights/tabs";
import { answerCard, type Signal, type SignalStatus } from "@/lib/insights/short-answer";
import { count, pct1, pts, signedPct, vsLabel } from "@/lib/insights/format";
import { connectHref } from "@/lib/insights-data";
import { marketingPm } from "@/lib/contact-person";
import { generateSeoReportAction } from "@/lib/actions/seo-actions";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { BlindSpots, Blurred, Card, KeyNumbers, ShortAnswer, StatusPill, WhatItMeans, WhatWeFound, type BlindSpot } from "@/components/insights/tab-parts";
import { AskIdeaButton } from "@/components/insights/ask-idea-button";
import { WORK_TZ } from "@/lib/working-hours";
import { cn } from "@/lib/utils";

const PURPLE = "#B455B6";
const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short" }).format(d);
const RANKINGS_SHOWN = 4;

/**
 * Insights → Website & search (Phase X v2, Ins4Website): "Do people find us, and does the website turn visits into
 * sales?" The short answer, visits / share who buy / visits from Google / visits from AI assistants, where visitors
 * drop off, where they come from, Google rankings, pages that sell, site health, findings and blind spots. Your own
 * site only: how you compare is on Competitors.
 */
export default async function WebsitePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const days = parseRange((await searchParams).range);
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const [t, findings, pm, connect] = await Promise.all([loadWebsiteTab(clientId, { days }), tabFindings(clientId, hrefAliases("/insights/website")), marketingPm(clientId), connectHref(clientId)]);
  const pmFirst = pm?.name.split(" ")[0] ?? "Klingit";
  const n = t.numbers;
  const vs = vsLabel(days);

  const blind: BlindSpot[] = [
    ...(t.ga4 && ["needs_reconnect", "error"].includes(t.ga4.status) ? [{ text: `Google Analytics disconnected since ${day(t.ga4.updatedAt)}: visits stopped coming in.`, action: { label: "Reconnect", href: "/settings/connections" } }] : []),
    ...(t.hasVisits ? [] : [{ text: "Visits and what people do on the site: connect Google Analytics.", action: { label: "Connect", href: connect } }]),
    ...(t.rankings.length ? [] : [{ text: "Google rankings for the searches that matter to you: connect Search Console.", action: { label: "Connect", href: connect } }]),
    ...(t.hasVisits && !t.funnel ? [{ text: "Where visitors drop off needs product-view and add-to-cart events in Google Analytics.", action: null }] : []),
    ...(t.hasVisits && !t.pages.length ? [{ text: "Which pages sell needs page-level numbers from Google Analytics.", action: null }] : []),
  ];

  if (!t.hasVisits) {
    return (
      <div className="flex flex-col gap-6">
        <Blurred line="Connect Google Analytics to see how many people visit, where they come from, and how many buy." action={{ label: "Connect Google Analytics", href: connect }}>
          <KeyNumbers items={["Visits", "Share who buy", "Visits from Google", "Visits from AI answers"].map((label) => ({ label, value: "00k", spark: [2, 3, 3, 4, 5] }))} />
        </Blurred>
        <BlindSpots items={blind} />
        <SiteHealth audit={t.audit} hasWebsite={Boolean(viewer.client.website)} />
      </div>
    );
  }

  // ─── The short answer ───────────────────────────────────────────────────────
  const ai = t.sources.find((s) => s.group === "AI assistants");
  const missing = t.rankings.find((r) => r.position === null);
  const kept = t.biggestDrop?.kept ?? null;
  const signals: Signal[] = [
    ...(n.visits.change !== null ? [{ id: "visits", status: (n.visits.change >= 0 ? "good" : "attention") as SignalStatus, value: signedPct(n.visits.change), label: `Visits, now ${count(n.visits.value)}`, weight: 2 }] : []),
    ...(t.biggestDrop && kept !== null ? [{ id: "drop", status: "attention" as const, value: `${Math.round(kept * 100)}%`, label: `Of ${t.biggestDrop.from === "Visited" ? "visitors" : t.biggestDrop.from.replace("Viewed a ", "").toLowerCase() + " views"} reach ${t.biggestDrop.to === "Added to cart" ? "the cart" : t.biggestDrop.to === "Bought" ? "a purchase" : "a product page"}`, weight: 3 }] : []),
    ...(ai && n.ai.value ? [{ id: "ai", status: "good" as const, value: count(n.ai.value), label: `Visits from AI assistants${ai.buyRate !== null ? `, and ${pct1(ai.buyRate)} of them buy` : ""}`, weight: 2.2 }] : []),
    ...(missing ? [{ id: "missing", status: "attention" as const, value: "Not in top 50", label: `On Google for “${missing.keyword}”`, weight: 1.5 }] : []),
  ];
  const card = answerCard(`${clientId}:website:${days}`, {
    headline: [
      n.visits.change !== null ? (n.visits.change >= 0 ? "More people find you" : "Fewer people find you") : `${count(n.visits.value)} visits`,
      t.biggestDrop ? `, but most leave before ${t.biggestDrop.to === "Added to cart" ? "the cart" : t.biggestDrop.to === "Bought" ? "buying" : "a product page"}.` : ".",
    ].join(""),
    signals,
  });

  const brDiff = n.buyRate.value !== null && n.buyRate.previous !== null ? n.buyRate.value - n.buyRate.previous : null;
  const delta = (ch: number | null) => (ch === null ? null : { text: `${signedPct(ch)} ${vs}`, tone: ch >= 0 ? ("good" as const) : ("bad" as const) });
  const maxStep = t.funnel ? Math.max(1, t.funnel[0].value) : 1;
  const maxSource = Math.max(1, ...t.sources.map((s) => s.visits));
  const dropText = t.biggestDrop
    ? `The biggest leak is ${t.biggestDrop.from.toLowerCase().replace("viewed a product", "product page").replace("visited", "arriving")} → ${t.biggestDrop.to.toLowerCase().replace("added to cart", "cart").replace("viewed a product", "product page")}.`
    : "";
  const lowPage = t.overallBuyRate !== null ? t.pages.find((p) => p.buyRate !== null && p.buyRate < t.overallBuyRate! * 0.6) : undefined;

  const lowText = lowPage && t.overallBuyRate ? ` The ${lowPage.page.replace(/^\//, "").replace(/-/g, " ")} page sells at ${lowPage.buyRate! / t.overallBuyRate < 0.55 && lowPage.buyRate! / t.overallBuyRate > 0.45 ? "half" : `${Math.round((lowPage.buyRate! / t.overallBuyRate) * 100)}% of`} your average.` : "";
  const dropAsked = dropText ? await askedAbout(clientId, "community", [dropText + lowText]) : new Set<string>();

  return (
    <div className="flex flex-col gap-6">
      <ShortAnswer card={card} sources={["GA4", ...(t.rankings.length ? ["Search Console"] : []), "Shopify"]} />

      <KeyNumbers
        items={[
          { label: "Visits", value: count(n.visits.value), change: delta(n.visits.change), spark: n.visits.spark },
          { label: "Share who buy", value: n.buyRate.value !== null ? pct1(n.buyRate.value) : "No orders yet", change: brDiff !== null ? { text: `${pts(brDiff)} ${vs}`, tone: brDiff >= 0 ? "good" : "bad" } : null, spark: n.buyRate.spark },
          { label: "Visits from Google", value: n.google.value ? count(n.google.value) : "Not tracked yet", change: n.google.value ? delta(n.google.change) : null, spark: n.google.spark },
          { label: "Visits from AI answers", value: n.ai.value ? count(n.ai.value) : "Not tracked yet", change: n.ai.value ? delta(n.ai.change) : null, spark: n.ai.spark },
        ]}
      />

      {t.funnel && (
        <Card title="Where visitors drop off" flush>
          <div className="grid grid-cols-2 gap-3 px-6 pt-5 min-[700px]:grid-cols-4">
            {t.funnel.map((st, i) => {
              const worst = t.biggestDrop?.to === st.label;
              return (
                <div key={st.label} className={cn("flex flex-col gap-1.5 rounded-xl p-2.5", worst && "bg-[#FFF1E8]")}>
                  <span className="flex h-24 items-end">
                    <span className="w-full rounded-t-[4px]" style={{ height: `${Math.max(4, (st.value / maxStep) * 100)}%`, background: worst ? "#FF5D02" : PURPLE }} />
                  </span>
                  <span className="text-[22px] font-light tabular-nums">{count(st.value, { exactUnder: 10_000 })}</span>
                  <span className="text-[14px]">{st.label}</span>
                  {st.kept !== null && <span className={cn("text-[12px]", worst ? "text-brand-orange-text" : "text-brand-ink-2")}>{worst ? "only " : ""}{Math.round(st.kept * 100)}% continue</span>}
                  {i === 0 && <span className="text-[12px] text-transparent">.</span>}
                </div>
              );
            })}
          </div>
          {t.biggestDrop ? (
            <WhatItMeans className="mt-4" action={<AskIdeaButton variant="dark" asked={dropAsked.has(dropText + lowText)} pm={pmFirst} about={{ question: dropText + lowText, value: `${Math.round((t.biggestDrop.kept ?? 0) * 100)}%`, sources: ["GA4", "Shopify"], href: "/insights/website", kind: "community" }} />}>
              {dropText + lowText}
            </WhatItMeans>
          ) : (
            <div className="h-6" />
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Where visitors come from" flush>
            <ul className="m-0 flex list-none flex-col gap-2 px-6 pt-5">
              {t.sources.map((s) => (
                <li key={s.group} className="grid grid-cols-[120px_minmax(0,1fr)_56px_72px] items-center gap-3 text-[14px]">
                  <span>{s.group}</span>
                  <span aria-hidden className="h-2.5 rounded-full" style={{ width: `${Math.max(2, (s.visits / maxSource) * 100)}%`, background: s.group === "AI assistants" ? "#1E1E1E" : PURPLE }} />
                  <span className="text-right tabular-nums">{count(s.visits)}</span>
                  <span className="text-right text-[13px] text-brand-ink-2">{s.buyRate !== null ? `${pct1(s.buyRate)} buy` : ""}</span>
                </li>
              ))}
            </ul>
            {ai && ai.buyRate !== null && t.overallBuyRate !== null && ai.buyRate > t.overallBuyRate ? <WhatItMeans className="mt-4">AI assistants send few visitors, but they buy well{n.ai.change !== null && n.ai.change > 0.3 ? `, and they’re up ${signedPct(n.ai.change)}` : ""}.</WhatItMeans> : <div className="h-6" />}
          </Card>
          <WhatWeFound findings={findings} pm={pmFirst} />
          <BlindSpots items={blind} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {t.rankings.length > 0 && (
            <Card title="How you rank on Google" flush>
              <div className="grid grid-cols-[minmax(0,1fr)_96px_64px] gap-3 bg-[#FAF8F3] px-6 py-3 font-brand-mono text-[11px] uppercase tracking-[0.04em] text-brand-ink-2">
                <span>Search</span>
                <span>Position</span>
                <span>Change</span>
              </div>
              <ul className="m-0 list-none p-0">
                {t.rankings.slice(0, RANKINGS_SHOWN).map((r) => (
                  <RankRow key={r.id} keyword={r.keyword} position={r.position} previous={r.previousPosition} />
                ))}
              </ul>
              {t.rankings.length > RANKINGS_SHOWN && (
                <details className="border-t border-brand-line">
                  <summary className="cursor-pointer list-none px-6 py-3 font-brand-mono text-[12px] uppercase text-brand-ink underline underline-offset-4">All {t.rankings.length}</summary>
                  <ul className="m-0 list-none p-0">
                    {t.rankings.slice(RANKINGS_SHOWN).map((r) => (
                      <RankRow key={r.id} keyword={r.keyword} position={r.position} previous={r.previousPosition} />
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          )}
          {t.pages.length > 0 && (
            <Card title="Pages that sell, and pages that don't" flush>
              <div className="grid grid-cols-[minmax(0,1fr)_80px_88px] gap-3 bg-[#FAF8F3] px-6 py-3 font-brand-mono text-[11px] uppercase tracking-[0.04em] text-brand-ink-2">
                <span>Page</span>
                <span>Visits</span>
                <span>Buy rate</span>
              </div>
              <ul className="m-0 list-none p-0">
                {t.pages.slice(0, 5).map((p) => (
                  <li key={p.page} className="grid grid-cols-[minmax(0,1fr)_80px_88px] items-center gap-3 border-b border-brand-line px-6 py-3.5 text-[14px] last:border-b-0">
                    <span className="truncate">{p.page}</span>
                    <span className="tabular-nums">{count(p.visits)}</span>
                    <span>{p.buyRate !== null ? <StatusPill tone={t.overallBuyRate !== null && p.buyRate < t.overallBuyRate * 0.8 ? "bad" : t.overallBuyRate !== null && p.buyRate > t.overallBuyRate ? "good" : "neutral"}>{pct1(p.buyRate)}</StatusPill> : null}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <SiteHealth audit={t.audit} hasWebsite={Boolean(viewer.client.website)} />
          <p className="m-0 text-[13px] text-brand-ink-2">
            How you compare with competitors in Google and AI answers is in{" "}
            <Link href="/insights/competitors" className="text-brand-ink underline underline-offset-4">
              Competitors
            </Link>
            .
          </p>
        </div>
      </div>
    </div>
  );
}

function RankRow({ keyword, position, previous }: { keyword: string; position: number | null; previous: number | null }) {
  const moved = position !== null && previous !== null ? previous - position : null;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_96px_64px] items-center gap-3 border-b border-brand-line px-6 py-3.5 text-[14px] last:border-b-0">
      <span className="truncate">{keyword}</span>
      <span className={cn("tabular-nums", position === null ? "text-[13px] text-brand-orange-text" : "text-[17px]")}>{position === null ? "Not in top 50" : `#${position}`}</span>
      <span>{moved ? <StatusPill tone={moved > 0 ? "good" : "bad"}>{Math.abs(moved)}</StatusPill> : null}</span>
    </li>
  );
}

type OnPage = { aiCrawlerAccess?: Record<string, string>; lcpSeconds?: number };

/** Site health (moved here from SEO & AI visibility): SEO score, AI crawlers allowed, page speed, and Run audit. */
function SiteHealth({ audit, hasWebsite }: { audit: Awaited<ReturnType<typeof loadWebsiteTab>>["audit"]; hasWebsite: boolean }) {
  if (!hasWebsite) return null;
  const onPage = audit && !audit.fetchError ? (audit.onPageChecks as OnPage) : null;
  const crawlers = Object.values(onPage?.aiCrawlerAccess ?? {});
  const facts = [
    audit?.seoScore != null ? `SEO health ${audit.seoScore} of 100` : null,
    crawlers.length ? `${crawlers.filter((c) => c === "allowed").length} of ${crawlers.length} AI crawlers allowed` : null,
    onPage?.lcpSeconds != null ? `page loads in ${onPage.lcpSeconds} s on mobile` : audit?.performanceScore != null ? `page speed ${audit.performanceScore} of 100` : null,
  ].filter(Boolean);
  return (
    <Card title="Site health" action={<AgentButton action={generateSeoReportAction} label={audit ? "Run audit again" : "Run audit"} pendingLabel="Auditing…" />}>
      <p className="m-0 text-[14px] leading-[1.5]">{audit?.fetchError ? `The last audit couldn't reach the site: ${audit.fetchError}` : facts.length ? `${facts.join(" · ")}.` : "No audit yet: run one to check SEO basics, AI crawler access and page speed."}</p>
    </Card>
  );
}
