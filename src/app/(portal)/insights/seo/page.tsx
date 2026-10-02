import { CheckCircle2, XCircle } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { formatDate, jsonArray } from "@/lib/utils";
import { generateSeoReportAction } from "@/lib/actions/seo-actions";
import { PageGrid } from "@/components/ds/page-grid";
import { SectionCard, CardBody, CardNote, CardRows } from "@/components/ds/card";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { NumberedRow } from "@/components/ds/numbered-row";
import { PillLink } from "@/components/ds/pill-link";
import { AgentButton } from "@/components/portal/insights/agent-button";

type Recommendation = { title: string; detail: string };
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
type Audit = {
  id: string;
  subject: string;
  domain: string;
  performanceScore: number | null;
  seoScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  onPageChecks: unknown;
  fetchError: string | null;
  auditedAt: Date;
};


function tone(score: number): PillTone {
  return score >= 90 ? "success" : score >= 50 ? "watch" : "danger";
}

/** Lighthouse scores; ones without data (no PageSpeed key) are left out, never shown as "—". */
function Scores({ audit, compact = false }: { audit: Audit; compact?: boolean }) {
  const scores = [
    { label: compact ? "Perf" : "Performance", v: audit.performanceScore },
    { label: "SEO", v: audit.seoScore },
    { label: compact ? "A11y" : "Accessibility", v: audit.accessibilityScore },
    { label: compact ? "Best pr." : "Best practices", v: audit.bestPracticesScore },
  ].filter((x): x is { label: string; v: number } => x.v !== null);
  if (scores.length === 0) return null;
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] bg-brand-line @min-[480px]/col:grid-cols-4">
      {scores.map((x) => (
        <div key={x.label} className="flex flex-col items-start gap-1.5 bg-white px-4 py-3">
          <span className={compact ? "text-[20px] font-light tabular-nums" : "text-[28px] font-light tabular-nums"}>{x.v}</span>
          <StatusPill tone={tone(x.v)}>{x.label}</StatusPill>
        </div>
      ))}
    </div>
  );
}

function Checklist({ onPage }: { onPage: OnPageChecks }) {
  const rows = [
    { ok: onPage.hasTitle, label: `Title tag ${onPage.hasTitle ? `(${onPage.titleLength} chars)` : "missing"}` },
    { ok: onPage.hasMetaDescription, label: `Meta description ${onPage.hasMetaDescription ? `(${onPage.metaDescriptionLength} chars)` : "missing"}` },
    { ok: onPage.h1Count > 0, label: `${onPage.h1Count} H1 heading${onPage.h1Count === 1 ? "" : "s"}` },
    { ok: onPage.hasSitemap, label: `sitemap.xml ${onPage.hasSitemap ? "found" : "not found"}` },
  ];
  return (
    <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[13px]">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center gap-2">
          {r.ok ? <CheckCircle2 className="size-4 text-brand-lime-strong" /> : <XCircle className="size-4 text-ds-danger-text" />}
          <span className="text-brand-ink-2">{r.label}</span>
        </li>
      ))}
    </ul>
  );
}

function Crawlers({ onPage }: { onPage: OnPageChecks }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Object.entries(onPage.aiCrawlerAccess).map(([bot, access]) => (
        <StatusPill key={bot} tone={access === "allowed" ? "success" : "danger"}>
          {bot}
        </StatusPill>
      ))}
    </div>
  );
}

function Structured({ onPage }: { onPage: OnPageChecks }) {
  return onPage.structuredDataTypes.length === 0 ? (
    <span className="text-[13px] text-brand-ink-2">None found</span>
  ) : (
    <div className="flex flex-wrap gap-1.5">
      {onPage.structuredDataTypes.map((t) => (
        <StatusPill key={t}>{t}</StatusPill>
      ))}
    </div>
  );
}

/** Insights → SEO & AI visibility: site health for you and tracked competitors, and whether AI assistants mention you. */
export default async function SeoPage() {
  const viewer = await getPortalViewer();
  const [audits, brief, checks] = await Promise.all([
    prisma.siteAudit.findMany({ where: { clientId: viewer.clientId } }),
    prisma.seoBrief.findUnique({ where: { clientId: viewer.clientId } }),
    prisma.aiVisibilityCheck.findMany({ where: { clientId: viewer.clientId }, orderBy: { checkedAt: "desc" }, take: 6 }),
  ]);
  const own = audits.find((a) => a.subject === "Own site") ?? null;
  const competitors = audits.filter((a) => a.subject !== "Own site");
  const scoresConfigured = own?.performanceScore !== null || competitors.some((a) => a.performanceScore !== null);

  if (!viewer.client.website) {
    return (
      <SectionCard title="SEO & AI visibility">
        <CardNote>No website on file yet. Your account lead adds it, then audits can run.</CardNote>
      </SectionCard>
    );
  }

  const ownOnPage = own && !own.fetchError ? (own.onPageChecks as OnPageChecks) : null;

  return (
    <PageGrid
      main={
        <>
          <SectionCard title="What this means for you" action={<AgentButton action={generateSeoReportAction} label={brief ? "Refresh audit" : "Run audit"} pendingLabel="Auditing sites…" />}>
            {brief ? (
              <>
                <p className="m-0 px-6 pt-5 text-[15px] leading-[1.55]">{brief.summary}</p>
                <CardRows as="ol">
                  {jsonArray<Recommendation>(brief.recommendations).map((r, i) => (
                    <NumberedRow
                      key={i}
                      n={i + 1}
                      title={r.title}
                      detail={r.detail}
                      action={<PillLink href={`/projects/new?${new URLSearchParams({ idea: r.title, detail: r.detail })}`}>Start a brief</PillLink>}
                    />
                  ))}
                </CardRows>
                <p className="m-0 border-t border-brand-line px-6 py-3 font-brand-mono text-[11px] text-brand-ink-2">GENERATED {formatDate(brief.generatedAt, { day: "numeric", month: "short" }).toUpperCase()}</p>
              </>
            ) : (
              <CardNote>Audit your site and your tracked competitors&apos; for SEO and AI-crawler readiness, and test whether AI assistants mention your brand.</CardNote>
            )}
          </SectionCard>

          <SectionCard title="Your site" meta={<span className="text-[13px] text-brand-ink-2">{own?.domain ?? viewer.client.website}</span>} action={own ? <span className="font-brand-mono text-[11px] text-brand-ink-2">AUDITED {formatDate(own.auditedAt, { day: "numeric", month: "short" }).toUpperCase()}</span> : undefined}>
            {!own ? (
              <CardNote>No audit yet. Run one above.</CardNote>
            ) : own.fetchError ? (
              <CardNote>Couldn&apos;t reach the site: {own.fetchError}</CardNote>
            ) : (
              <CardBody className="flex flex-col gap-5">
                <Scores audit={own} />
                {!scoresConfigured && <p className="m-0 text-[12px] text-brand-ink-2">Lighthouse scores need a PageSpeed Insights key. Everything else here is live.</p>}
                <div className="grid grid-cols-1 gap-5 @min-[600px]/col:grid-cols-2">
                  <Checklist onPage={ownOnPage!} />
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[12px] text-brand-ink-2">Structured data</span>
                      <Structured onPage={ownOnPage!} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[12px] text-brand-ink-2">AI crawler access</span>
                      <Crawlers onPage={ownOnPage!} />
                    </div>
                  </div>
                </div>
              </CardBody>
            )}
          </SectionCard>

          {checks.length > 0 && (
            <SectionCard title="AI visibility tests" action={!process.env.PERPLEXITY_API_KEY ? <span className="text-[12px] text-brand-ink-2">Claude only</span> : undefined}>
              <p className="m-0 px-6 pt-5 text-[13px] leading-[1.55] text-brand-ink-2">
                Real questions asked to Claude and Perplexity (grounded in a live web search), checked for which tracked brands the answer mentions. A proxy for AI-search visibility, not a direct read of Google AI Overviews or ChatGPT.
              </p>
              <CardRows className="mt-3 border-t border-brand-line">
                {checks.map((c) => (
                  <li key={c.id} className="flex flex-col gap-2 px-6 py-4">
                    <div className="flex items-start gap-3">
                      <span className="min-w-0 flex-1 text-[15px]">&ldquo;{c.question}&rdquo;</span>
                      <StatusPill className="capitalize">{c.engine}</StatusPill>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {jsonArray<{ brand: string; mentioned: boolean }>(c.mentions).map((m) => (
                        <StatusPill key={m.brand} tone={m.mentioned ? "success" : "neutral"}>
                          {m.mentioned ? "✓" : "✕"} {m.brand}
                        </StatusPill>
                      ))}
                    </div>
                    <p className="m-0 text-[13px] italic leading-[1.5] text-brand-ink-2">
                      &ldquo;{c.answer.slice(0, 280)}
                      {c.answer.length > 280 ? "…" : ""}&rdquo;
                    </p>
                  </li>
                ))}
              </CardRows>
            </SectionCard>
          )}
        </>
      }
      side={
        competitors.length > 0 ? (
          <SectionCard title="Competitors">
            <CardRows>
              {competitors.map((a) => {
                const onPage = a.fetchError ? null : (a.onPageChecks as OnPageChecks);
                const blocked = onPage ? Object.entries(onPage.aiCrawlerAccess).filter(([, v]) => v === "blocked") : [];
                return (
                  <li key={a.id} className="@container/col flex flex-col gap-3 px-6 py-4">
                    <span className="flex flex-col">
                      <span className="text-[15px]">{a.subject}</span>
                      <span className="text-[12px] text-brand-ink-2">{a.domain}</span>
                    </span>
                    {!onPage ? (
                      <span className="text-[13px] text-ds-danger-text">Couldn&apos;t reach the site</span>
                    ) : (
                      <>
                        <Scores audit={a} compact />
                        <Checklist onPage={onPage} />
                        <Structured onPage={onPage} />
                        {blocked.length > 0 && <span className="text-[12px] text-ds-danger-text">Blocks {blocked.map(([b]) => b).join(", ")}</span>}
                      </>
                    )}
                  </li>
                );
              })}
            </CardRows>
          </SectionCard>
        ) : undefined
      }
    />
  );
}
