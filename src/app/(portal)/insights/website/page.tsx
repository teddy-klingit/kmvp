import Link from "next/link";
import { getPortalViewer } from "@/lib/current-viewer";
import { parseRange } from "@/lib/insights/daily";
import { loadWebsiteTab } from "@/lib/insights/website-tab";
import { tabFindings } from "@/lib/insight-records";
import { hrefAliases } from "@/lib/insights/tabs";
import { shortAnswer } from "@/lib/insights/short-answer";
import { count, pct1, pts, signedPct, vsLabel } from "@/lib/insights/format";
import { connectHref } from "@/lib/insights-data";
import { marketingPm } from "@/lib/contact-person";
import { generateSeoReportAction } from "@/lib/actions/seo-actions";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { BlindSpots, Blurred, Card, KeyNumbers, ShortAnswer, WhatWeFound, type BlindSpot } from "@/components/insights/tab-parts";
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
  const lastLabel = days === 365 ? "12 months" : `${days} days`;

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
  const answer = shortAnswer(
    `${clientId}:website:${days}`,
    [
      n.visits.change !== null ? `${n.visits.change >= 0 ? "More" : "Fewer"} people find you: visits ${n.visits.change >= 0 ? "up" : "down"} ${Math.abs(Math.round(n.visits.change * 100))}%${ai && n.ai.value ? `, and AI assistants now send ${count(n.ai.value)} visitors${ai.buyRate !== null && t.overallBuyRate !== null && ai.buyRate > t.overallBuyRate ? " who buy well" : ""}` : ""}.` : `${count(n.visits.value)} visits in the last ${lastLabel}.`,
      t.biggestDrop ? `Most visitors leave between ${t.biggestDrop.from === "Visited" ? "arriving" : `the ${t.biggestDrop.from.replace("Viewed a ", "").toLowerCase()} page`} and ${t.biggestDrop.to === "Added to cart" ? "the cart" : t.biggestDrop.to === "Bought" ? "buying" : "a product page"}${missing ? `, and you're invisible for “${missing.keyword}”` : ""}.` : missing ? `You're invisible for “${missing.keyword}”.` : null,
    ]
      .filter(Boolean)
      .join(" ")
  );

  const brDiff = n.buyRate.value !== null && n.buyRate.previous !== null ? n.buyRate.value - n.buyRate.previous : null;
  const delta = (ch: number | null) => (ch === null ? null : { text: `${signedPct(ch)} ${vs}`, tone: ch >= 0 ? ("good" as const) : ("bad" as const) });
  const maxStep = t.funnel ? Math.max(1, t.funnel[0].value) : 1;
  const maxSource = Math.max(1, ...t.sources.map((s) => s.visits));
  const lowPage = t.overallBuyRate !== null ? t.pages.find((p) => p.buyRate !== null && p.buyRate < t.overallBuyRate! / 2) : undefined;

  return (
    <div className="flex flex-col gap-6">
      <ShortAnswer text={answer} sources={["GA4", ...(t.rankings.length ? ["Search Console"] : []), "Shopify"]} />

      <KeyNumbers
        items={[
          { label: "Visits", value: count(n.visits.value), change: delta(n.visits.change), spark: n.visits.spark },
          { label: "Share who buy", value: n.buyRate.value !== null ? pct1(n.buyRate.value) : "No orders yet", change: brDiff !== null ? { text: `${pts(brDiff)} ${vs}`, tone: brDiff >= 0 ? "good" : "bad" } : null, spark: n.buyRate.spark },
          { label: "Visits from Google", value: n.google.value ? count(n.google.value) : "Not tracked yet", change: n.google.value ? delta(n.google.change) : null, spark: n.google.spark },
          { label: "Visits from AI answers", value: n.ai.value ? count(n.ai.value) : "Not tracked yet", change: n.ai.value ? delta(n.ai.change) : null, spark: n.ai.spark },
        ]}
      />

      {t.funnel && (
        <Card title="Where visitors drop off">
          <div className="grid grid-cols-2 gap-3 min-[700px]:grid-cols-4">
            {t.funnel.map((s, i) => {
              const worst = t.biggestDrop?.to === s.label;
              return (
                <div key={s.label} className="flex flex-col gap-2">
                  <span className="flex h-24 items-end">
                    <span className="w-full rounded-t-[4px]" style={{ height: `${Math.max(4, (s.value / maxStep) * 100)}%`, background: PURPLE }} />
                  </span>
                  <span className="text-[14px]">{s.label}</span>
                  <span className="text-[20px] font-light tabular-nums">{count(s.value, { exactUnder: 10_000 })}</span>
                  {s.kept !== null && <span className={cn("text-[12px]", worst ? "text-brand-orange-text" : "text-brand-ink-2")}>{Math.round(s.kept * 100)}% of {i === 1 ? "visitors" : i === 2 ? "product views" : "carts"}</span>}
                </div>
              );
            })}
          </div>
          {t.biggestDrop && (
            <p className="m-0 mt-4 text-[14px] leading-[1.5]">
              The big drop is {t.biggestDrop.from.toLowerCase().replace("viewed a product", "product page")} → {t.biggestDrop.to.toLowerCase().replace("added to cart", "cart")}.
              {lowPage && t.overallBuyRate ? ` The ${lowPage.page} page converts at ${Math.round((lowPage.buyRate! / t.overallBuyRate) * 100)}% of your average.` : ""}
            </p>
          )}
        </Card>
      )}

      <div className="grid grid-cols-1 items-start gap-6 min-[1100px]:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <Card title="Where visitors come from">
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {t.sources.map((s) => (
                <li key={s.group} className="grid grid-cols-[120px_minmax(0,1fr)_56px_72px] items-center gap-3 text-[14px]">
                  <span>{s.group}</span>
                  <span aria-hidden className="h-2.5 rounded-full" style={{ width: `${Math.max(2, (s.visits / maxSource) * 100)}%`, background: s.group === "AI assistants" ? "#1E1E1E" : PURPLE }} />
                  <span className="text-right tabular-nums">{count(s.visits)}</span>
                  <span className="text-right text-[13px] text-brand-ink-2">{s.buyRate !== null ? `${pct1(s.buyRate)} buy` : ""}</span>
                </li>
              ))}
            </ul>
            {ai && ai.buyRate !== null && t.overallBuyRate !== null && ai.buyRate > t.overallBuyRate && <p className="m-0 mt-4 text-[13px] text-brand-ink-2">Visitors from AI assistants are few but buy more than most.</p>}
          </Card>
          <WhatWeFound findings={findings} pm={pmFirst} />
          <BlindSpots items={blind} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          {t.rankings.length > 0 && (
            <Card title="How you rank on Google" flush>
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
              <ul className="m-0 list-none p-0">
                {t.pages.slice(0, 5).map((p) => (
                  <li key={p.page} className="grid grid-cols-[minmax(0,1fr)_96px_72px] items-center gap-3 border-b border-brand-line px-6 py-3.5 text-[14px] last:border-b-0">
                    <span className="truncate">{p.page}</span>
                    <span className="text-right tabular-nums">{count(p.visits)} visits</span>
                    <span className={cn("text-right tabular-nums", p === lowPage && "text-brand-orange-text")}>{p.buyRate !== null ? `${pct1(p.buyRate)} buy` : ""}</span>
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
    <li className="grid grid-cols-[minmax(0,1fr)_96px_40px] items-center gap-3 border-b border-brand-line px-6 py-3.5 text-[14px] last:border-b-0">
      <span className="truncate">{keyword}</span>
      <span className={cn("tabular-nums", position === null && "text-brand-orange-text")}>{position === null ? "not in top 50" : `#${position}`}</span>
      <span className={cn("text-right text-[13px]", moved && moved > 0 ? "text-[#6E7D2F]" : moved && moved < 0 ? "text-brand-orange-text" : "text-brand-ink-2")}>{moved ? `${moved > 0 ? "↑" : "↓"} ${Math.abs(moved)}` : position !== null ? "–" : ""}</span>
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
