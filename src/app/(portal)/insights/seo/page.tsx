import { Check, Minus } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { generateSeoReportAction } from "@/lib/actions/seo-actions";
import { PageGrid } from "@/components/ds/page-grid";
import { PillLink } from "@/components/ds/pill-link";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { ChartCard, SkeletonChart, StatTile, WhySheet } from "@/components/insights/cards";
import { BarList, StackBar } from "@/components/insights/charts";
import { SERIES } from "@/components/insights/tokens";

type OnPageChecks = {
  hasTitle: boolean;
  titleLength: number;
  hasMetaDescription: boolean;
  metaDescriptionLength: number;
  h1Count: number;
  structuredDataTypes: string[];
  hasSitemap: boolean;
  aiCrawlerAccess: Record<string, "allowed" | "blocked">;
};
type Fix = { title: string; detail: string; impact?: "High" | "Medium" | "Low" };
type Result = "pass" | "warn" | "error";

const ENGINE: Record<string, string> = { claude: "Claude", perplexity: "Perplexity", chatgpt: "ChatGPT", gemini: "Gemini" };
const MATRIX_SHOWN = 5;

/** Every audited check, as passed / warning / error. */
function auditChecks(onPage: OnPageChecks, scores: (number | null)[]): Result[] {
  const score = (v: number | null): Result[] => (v === null ? [] : [v >= 90 ? "pass" : v >= 50 ? "warn" : "error"]);
  return [
    onPage.hasTitle ? (onPage.titleLength > 60 ? "warn" : "pass") : "error",
    onPage.hasMetaDescription ? (onPage.metaDescriptionLength > 160 ? "warn" : "pass") : "error",
    onPage.h1Count === 1 ? "pass" : onPage.h1Count === 0 ? "error" : "warn",
    onPage.hasSitemap ? "pass" : "warn",
    onPage.structuredDataTypes.length ? "pass" : "warn",
    ...Object.values(onPage.aiCrawlerAccess).map((a): Result => (a === "allowed" ? "pass" : "warn")),
    ...scores.flatMap(score),
  ];
}

/**
 * Insights → SEO & AI visibility (InsightsSEO.dc.html): tiles, who AI assistants recommend (share of buyer
 * questions mentioning each brand), "Are you in the answer?" (question × assistant), the site audit with its
 * top fixes, and you vs competitors. Before the first audit, each block is a skeleton with "Run audit".
 */
export default async function SeoPage() {
  const viewer = await getPortalViewer();
  const clientId = viewer.clientId;
  const [audits, brief, checks] = await Promise.all([
    prisma.siteAudit.findMany({ where: { clientId } }),
    prisma.seoBrief.findUnique({ where: { clientId } }),
    prisma.aiVisibilityCheck.findMany({ where: { clientId }, orderBy: { checkedAt: "desc" }, take: 200 }),
  ]);
  const runAudit = <AgentButton action={generateSeoReportAction} label="Run audit" pendingLabel="Auditing sites…" />;

  if (!viewer.client.website) {
    return (
      <ChartCard title="SEO & AI visibility">
        <SkeletonChart line="No website on file yet. Your account lead adds it, then audits can run." />
      </ChartCard>
    );
  }

  const own = audits.find((a) => a.subject === "Own site") ?? null;
  const competitors = audits.filter((a) => a.subject !== "Own site");
  const onPage = own && !own.fetchError ? (own.onPageChecks as OnPageChecks) : null;

  // The latest run: every check within a day of the newest one.
  const newest = checks[0]?.checkedAt.getTime() ?? 0;
  const run = checks.filter((c) => newest - c.checkedAt.getTime() < 86400000);
  const questions = [...new Set(run.map((c) => c.question))];
  const engines = [...new Set(run.map((c) => c.engine))];
  const mentions = run.map((c) => ({ ...c, list: jsonArray<{ brand: string; mentioned: boolean }>(c.mentions) }));
  const isOwn = (b: string) => b.toLowerCase() === viewer.client.name.toLowerCase();
  const brands = [...new Set(mentions.flatMap((c) => c.list.map((m) => m.brand)))];
  const share = brands
    .map((b) => {
      const asked = mentions.filter((c) => c.list.some((m) => m.brand === b));
      const hit = asked.filter((c) => c.list.some((m) => m.brand === b && m.mentioned)).length;
      return { brand: b, value: asked.length ? Math.round((hit / asked.length) * 100) : 0 };
    })
    .sort((a, b) => b.value - a.value);
  const ownHits = mentions.filter((c) => c.list.some((m) => isOwn(m.brand) && m.mentioned)).length;
  const inAnswer = (q: string, e: string) => mentions.find((c) => c.question === q && c.engine === e)?.list.some((m) => isOwn(m.brand) && m.mentioned);
  const runDate = newest ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(newest)).toUpperCase() : null;

  const results = onPage ? auditChecks(onPage, [own!.performanceScore, own!.seoScore, own!.accessibilityScore, own!.bestPracticesScore]) : [];
  const count = (r: Result) => results.filter((x) => x === r).length;
  const crawlers = onPage ? Object.values(onPage.aiCrawlerAccess) : [];
  const fixes = jsonArray<Fix>(brief?.recommendations).slice(0, 3);
  const vs = audits.filter((a) => a.seoScore !== null).sort((a, b) => b.seoScore! - a.seoScore!);

  return (
    <div className="flex flex-col gap-6">
      {(run.length > 0 || own) && (
        <div className="grid grid-cols-2 gap-4 min-[1000px]:grid-cols-4">
          {run.length > 0 && <StatTile icon="ai" label="Mentioned by AI assistants" value={`${ownHits} of ${run.length}`} context="answers to buyer questions" />}
          {own?.seoScore != null && <StatTile icon="seo" label="SEO health" value={String(own.seoScore)} context="of 100 · Lighthouse" />}
          {crawlers.length > 0 && <StatTile icon="crawlers" label="AI crawlers allowed" value={`${crawlers.filter((c) => c === "allowed").length} of ${crawlers.length}`} context="robots.txt" />}
          {own?.performanceScore != null && <StatTile icon="speed" label="Page speed (mobile)" value={String(own.performanceScore)} context="Lighthouse performance score" />}
        </div>
      )}

      <PageGrid
        main={
          <>
            <ChartCard title="Who AI assistants recommend" table={{ columns: ["Brand", "Share of questions"], rows: share.map((s) => [s.brand, `${s.value}%`]) }}>
              {share.length > 0 ? (
                <>
                  <div className="flex flex-col">
                    <span className="text-[16px]">Share of {questions.length} buyer question{questions.length === 1 ? "" : "s"} where each brand is mentioned</span>
                    <span className="text-[14px] text-brand-mute">Asked in {engines.map((e) => ENGINE[e] ?? e).join(" and ")}, grounded in a live web search</span>
                  </div>
                  <BarList rows={share.map((s) => ({ label: s.brand, value: s.value, display: `${s.value}%`, tone: isOwn(s.brand) ? "ink" : "grey" }))} max={100} labelWidth={130} />
                </>
              ) : (
                <SkeletonChart line="No AI answers checked yet." action={runAudit} />
              )}
            </ChartCard>

            <ChartCard
              flush
              title="Are you in the answer?"
              meta={runDate ? <span className="font-brand-mono text-[12px] text-brand-ink">RUN {runDate}</span> : undefined}
              table={{ columns: ["Question", ...engines.map((e) => ENGINE[e] ?? e)], rows: questions.map((q) => [q, ...engines.map((e) => (inAnswer(q, e) === undefined ? "not asked" : inAnswer(q, e) ? "yes" : "no"))]) }}
            >
              {questions.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] border-collapse text-[15px]">
                    <thead>
                      <tr className="text-[13px] text-brand-mute">
                        <th className="px-6 py-3 text-left font-normal">Question</th>
                        {engines.map((e) => (
                          <th key={e} className="w-24 px-2 py-3 text-center font-normal">
                            {ENGINE[e] ?? e}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {questions.slice(0, MATRIX_SHOWN).map((q) => (
                        <MatrixRow key={q} q={q} engines={engines} inAnswer={inAnswer} />
                      ))}
                    </tbody>
                  </table>
                  {questions.length > MATRIX_SHOWN && (
                    <details>
                      <summary className="cursor-pointer list-none px-6 py-3 text-[13px] text-brand-ink-2">
                        <span className="text-brand-ink underline underline-offset-2">see all {questions.length}</span>
                      </summary>
                      <table className="w-full min-w-[480px] border-collapse text-[15px]">
                        <tbody>
                          {questions.slice(MATRIX_SHOWN).map((q) => (
                            <MatrixRow key={q} q={q} engines={engines} inAnswer={inAnswer} />
                          ))}
                        </tbody>
                      </table>
                    </details>
                  )}
                </div>
              ) : (
                <div className="px-6 py-5">
                  <SkeletonChart shape="matrix" line="Buyer questions are asked to AI assistants when the audit runs." action={runAudit} />
                </div>
              )}
            </ChartCard>
          </>
        }
        side={
          <>
            <ChartCard title="Site audit" meta={results.length ? <span className="font-brand-mono text-[12px] text-brand-ink">{results.length} CHECKS</span> : undefined} table={results.length ? { columns: ["Result", "Checks"], rows: [["Passed", count("pass")], ["Warnings", count("warn")], ["Errors", count("error")]] } : undefined}>
              {onPage ? (
                <>
                  <StackBar
                    segments={[
                      { label: "Passed", value: count("pass"), color: SERIES[1] },
                      { label: "Warnings", value: count("warn"), color: "#C2C3C5" },
                      { label: "Errors", value: count("error"), color: SERIES[2] },
                    ]}
                  />
                  {fixes.length > 0 && (
                    <ul className="m-0 flex list-none flex-col p-0">
                      {fixes.map((f) => (
                        <li key={f.title} className="flex items-center gap-3 border-t border-brand-line py-3">
                          <span className="min-w-0 flex-1 text-[15px] leading-[1.4]">{f.title}</span>
                          {f.impact && <span className="shrink-0 rounded-full bg-brand-chip px-2.5 py-0.5 text-[12px] text-brand-ink-2">{f.impact === "Medium" ? "Medium" : `${f.impact} impact`}</span>}
                          <WhySheet title={f.title} reasoning={f.detail} />
                        </li>
                      ))}
                    </ul>
                  )}
                  {fixes.length > 0 && (
                    <PillLink href={`/brief/new?${new URLSearchParams({ q: `Website fixes: ${fixes.map((f) => f.title).join("; ")}` })}`} variant="primary" size="sm" className="self-start">
                      Make these a brief
                    </PillLink>
                  )}
                </>
              ) : own?.fetchError ? (
                <SkeletonChart line={`Couldn't reach the site: ${own.fetchError}`} action={runAudit} />
              ) : (
                <SkeletonChart line="No audit yet" action={runAudit} />
              )}
            </ChartCard>

            <ChartCard title="You vs competitors" table={{ columns: ["Site", "SEO score"], rows: vs.map((a) => [a.subject === "Own site" ? viewer.client.name : a.subject, a.seoScore!]) }}>
              {own?.seoScore != null && vs.length > 1 ? (
                <>
                  <BarList rows={vs.map((a) => ({ label: a.subject === "Own site" ? viewer.client.name : a.subject, value: a.seoScore!, display: String(a.seoScore), tone: a.subject === "Own site" ? "ink" : "grey" }))} max={100} labelWidth={110} compact />
                  <span className="text-[13px] text-brand-mute">SEO health score</span>
                </>
              ) : (
                <SkeletonChart line={!competitors.length ? "Audit your competitors' sites alongside yours." : own?.seoScore == null ? "Your site has no Lighthouse score yet." : "No competitor scores yet."} action={runAudit} />
              )}
            </ChartCard>
          </>
        }
      />
    </div>
  );
}

function MatrixRow({ q, engines, inAnswer }: { q: string; engines: string[]; inAnswer: (q: string, e: string) => boolean | undefined }) {
  return (
    <tr className="border-t border-brand-line">
      <td className="px-6 py-3.5">{q}</td>
      {engines.map((e) => {
        const v = inAnswer(q, e);
        return (
          <td key={e} className="px-2 py-3.5 text-center">
            {v === undefined ? (
              <span className="text-[12px] text-brand-mute">not asked</span>
            ) : (
              <span aria-label={v ? "Mentioned" : "Not mentioned"} className={`inline-flex size-6 items-center justify-center rounded-full ${v ? "bg-brand-lime-pale" : "bg-brand-chip"}`}>
                {v ? <Check className="size-3.5 text-brand-ink" strokeWidth={2} /> : <Minus className="size-3.5 text-brand-mute" strokeWidth={2} />}
              </span>
            )}
          </td>
        );
      })}
    </tr>
  );
}
