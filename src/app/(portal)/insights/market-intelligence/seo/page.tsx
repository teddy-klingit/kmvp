import Link from "next/link";
import { CheckCircle2, XCircle, Lightbulb, Gauge, Bot, MessageCircleQuestion, ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate, jsonArray } from "@/lib/utils";
import { GenerateSeoReportButton } from "@/components/portal/generate-seo-report-button";

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

function ScoreBadge({ label, score, size = "md" }: { label: string; score: number | null; size?: "md" | "lg" }) {
  const tone = score === null ? "neutral" : score >= 90 ? "success" : score >= 50 ? "warning" : "danger";
  return (
    <div className={`flex flex-col items-center gap-1 rounded-lg border border-border bg-paper ${size === "lg" ? "p-4" : "p-3"}`}>
      <p className={size === "lg" ? "font-display text-2xl font-light" : "text-lg font-semibold"}>{score === null ? "—" : score}</p>
      <Badge tone={tone} className="text-[10px]">
        {label}
      </Badge>
    </div>
  );
}

function OnPageChecklist({ onPage, size = "md" }: { onPage: OnPageChecks; size?: "md" | "sm" }) {
  const rows = [
    { ok: onPage.hasTitle, label: `Title tag ${onPage.hasTitle ? `(${onPage.titleLength} chars)` : "missing"}` },
    { ok: onPage.hasMetaDescription, label: `Meta description ${onPage.hasMetaDescription ? `(${onPage.metaDescriptionLength} chars)` : "missing"}` },
    { ok: onPage.h1Count > 0, label: `${onPage.h1Count} H1 heading${onPage.h1Count === 1 ? "" : "s"}` },
    { ok: onPage.hasSitemap, label: `sitemap.xml ${onPage.hasSitemap ? "found" : "not found"}` },
  ];
  const iconSize = size === "sm" ? "size-3" : "size-3.5";
  const textSize = size === "sm" ? "text-[11px]" : "text-xs";
  return (
    <div className={`flex flex-col gap-1.5 ${textSize}`}>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-1.5">
          {r.ok ? <CheckCircle2 className={`${iconSize} text-success-foreground`} /> : <XCircle className={`${iconSize} text-danger-foreground`} />}
          <span className="text-muted-foreground">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

function OwnSiteCard({ audit }: { audit: Audit | null }) {
  if (!audit) {
    return (
      <Card className="flex flex-col gap-2 p-6">
        <p className="text-sm font-semibold">Your site</p>
        <p className="text-sm text-muted-foreground">No audit yet — run one above.</p>
      </Card>
    );
  }

  if (audit.fetchError) {
    return (
      <Card className="flex flex-col gap-2 p-6">
        <p className="text-sm font-semibold">Your site</p>
        <p className="text-xs text-muted-foreground">{audit.domain}</p>
        <p className="text-sm text-danger-foreground">Couldn&apos;t reach site: {audit.fetchError}</p>
      </Card>
    );
  }

  const onPage = audit.onPageChecks as OnPageChecks;

  return (
    <Card className="flex flex-col gap-5 border-l-4 border-l-accent p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-base font-semibold">Your site</p>
          <p className="text-sm text-muted-foreground">{audit.domain}</p>
        </div>
        <p className="text-[11px] text-muted-foreground">Audited {formatDate(audit.auditedAt, { day: "2-digit", month: "short" })}</p>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <ScoreBadge label="Performance" score={audit.performanceScore} size="lg" />
        <ScoreBadge label="SEO" score={audit.seoScore} size="lg" />
        <ScoreBadge label="Accessibility" score={audit.accessibilityScore} size="lg" />
        <ScoreBadge label="Best practices" score={audit.bestPracticesScore} size="lg" />
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <OnPageChecklist onPage={onPage} />
        <div className="flex flex-col gap-3">
          <div>
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Structured data</p>
            {onPage.structuredDataTypes.length === 0 ? (
              <p className="text-xs text-muted-foreground">None found</p>
            ) : (
              <div className="flex flex-wrap gap-1">
                {onPage.structuredDataTypes.map((t) => (
                  <Badge key={t} tone="info" className="text-[10px]">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <Bot className="size-3" />
              AI crawler access
            </p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(onPage.aiCrawlerAccess).map(([bot, access]) => (
                <Badge key={bot} tone={access === "allowed" ? "success" : "danger"} className="text-[10px]">
                  {bot}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function CompetitorAuditCard({ audit }: { audit: Audit }) {
  if (audit.fetchError) {
    return (
      <Card className="flex flex-col gap-1.5 p-4">
        <p className="text-sm font-semibold">{audit.subject}</p>
        <p className="text-xs text-muted-foreground">{audit.domain}</p>
        <p className="text-xs text-danger-foreground">Couldn&apos;t reach site</p>
      </Card>
    );
  }

  const onPage = audit.onPageChecks as OnPageChecks;
  const blockedCrawlers = Object.entries(onPage.aiCrawlerAccess).filter(([, access]) => access === "blocked");

  return (
    <Card className="flex flex-col gap-2.5 p-4">
      <div>
        <p className="text-sm font-semibold">{audit.subject}</p>
        <p className="text-[11px] text-muted-foreground">{audit.domain}</p>
      </div>
      <div className="grid grid-cols-4 gap-1">
        <ScoreBadge label="Perf" score={audit.performanceScore} />
        <ScoreBadge label="SEO" score={audit.seoScore} />
        <ScoreBadge label="A11y" score={audit.accessibilityScore} />
        <ScoreBadge label="Best pr." score={audit.bestPracticesScore} />
      </div>
      <OnPageChecklist onPage={onPage} size="sm" />
      <div className="flex flex-wrap gap-1">
        {onPage.structuredDataTypes.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">No structured data</span>
        ) : (
          onPage.structuredDataTypes.map((t) => (
            <Badge key={t} tone="info" className="text-[10px]">
              {t}
            </Badge>
          ))
        )}
      </div>
      {blockedCrawlers.length > 0 && (
        <p className="flex items-center gap-1 text-[11px] text-danger-foreground">
          <Bot className="size-3" />
          Blocks {blockedCrawlers.map(([bot]) => bot).join(", ")}
        </p>
      )}
    </Card>
  );
}

export default async function MarketIntelligenceSeoPage() {
  const viewer = await getPortalViewer();

  const [audits, brief, visibilityChecks] = await Promise.all([
    prisma.siteAudit.findMany({ where: { clientId: viewer.clientId } }),
    prisma.seoBrief.findUnique({ where: { clientId: viewer.clientId } }),
    prisma.aiVisibilityCheck.findMany({ where: { clientId: viewer.clientId }, orderBy: { checkedAt: "desc" }, take: 6 }),
  ]);

  const ownAudit = audits.find((a) => a.subject === "Own site") ?? null;
  const competitorAudits = audits.filter((a) => a.subject !== "Own site");
  const scoresConfigured = ownAudit?.performanceScore !== null || competitorAudits.some((a) => a.performanceScore !== null);

  if (!viewer.client.website) {
    return (
      <Card className="flex items-center justify-between gap-4 p-5">
        <p className="text-sm text-muted-foreground">No website on file for this client yet — an account manager needs to add it before this can run.</p>
      </Card>
    );
  }

  return (
    <>
      {!brief ? (
        <Card className="flex flex-col items-start gap-3 border-l-4 border-l-accent p-5">
          <div>
            <p className="text-sm font-semibold">SEO & AI visibility</p>
            <p className="text-sm text-muted-foreground">
              Audit your site and tracked competitors&apos; sites for real SEO/AI-crawler readiness, and test whether
              your brand actually gets mentioned when a real question is put to an AI assistant.
            </p>
          </div>
          <GenerateSeoReportButton label="Run audit" />
        </Card>
      ) : (
        <Card className="flex flex-col gap-4 border-l-4 border-l-accent p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">What this means for you</p>
              <p className="mt-1 text-sm text-muted-foreground">{brief.summary}</p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <GenerateSeoReportButton label="Refresh audit" />
              <p className="text-[11px] text-muted-foreground">Generated {formatDate(brief.generatedAt, { day: "2-digit", month: "short" })}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {jsonArray<Recommendation>(brief.recommendations).map((r, i) => {
              const briefParams = new URLSearchParams({ idea: r.title, detail: r.detail });
              return (
                <div key={i} className="flex flex-col gap-2 rounded-lg border border-border bg-paper p-3">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-ink" />
                    <div>
                      <p className="text-xs font-semibold text-foreground">{r.title}</p>
                      <p className="text-xs text-muted-foreground">{r.detail}</p>
                    </div>
                  </div>
                  <Link
                    href={`/projects/new?${briefParams.toString()}`}
                    className="flex items-center gap-1 self-start pl-5 text-xs font-medium text-primary hover:underline"
                  >
                    Start a brief from this <ArrowRight className="size-3" />
                  </Link>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-1.5">
          <Gauge className="size-4 text-muted-foreground" />
          <SectionLabel>Site health</SectionLabel>
        </div>

        {!scoresConfigured && audits.length > 0 && (
          <Card className="p-4">
            <p className="text-xs text-muted-foreground">
              Performance/SEO/Accessibility/Best-practices scores need a PageSpeed Insights API key configured —
              everything else here (on-page checks, structured data, AI crawler access) is live.
            </p>
          </Card>
        )}

        <OwnSiteCard audit={ownAudit} />

        {competitorAudits.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Competitors</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {competitorAudits.map((a) => (
                <CompetitorAuditCard key={a.id} audit={a} />
              ))}
            </div>
          </div>
        )}
      </div>

      {visibilityChecks.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-1.5">
            <MessageCircleQuestion className="size-4 text-muted-foreground" />
            <SectionLabel>AI visibility tests</SectionLabel>
          </div>
          <p className="text-xs text-muted-foreground">
            Real questions asked to Claude and Perplexity (both grounded in a live web search, not just model
            memory) as a customer would, checked for which tracked brands actually got mentioned in the answer. A
            proxy for AI-search visibility generally — not a direct read of Google AI Overviews or ChatGPT
            specifically.
          </p>
          {!process.env.PERPLEXITY_API_KEY && (
            <p className="text-[11px] text-muted-foreground">Perplexity isn&apos;t configured yet — showing Claude only.</p>
          )}
          <div className="flex flex-col gap-3">
            {visibilityChecks.map((check) => (
              <Card key={check.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">&quot;{check.question}&quot;</p>
                  <Badge tone="neutral" className="shrink-0 text-[10px] capitalize">
                    {check.engine}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {jsonArray<{ brand: string; mentioned: boolean }>(check.mentions).map((m) => (
                    <Badge key={m.brand} tone={m.mentioned ? "success" : "neutral"} className="text-[10px]">
                      {m.mentioned ? "✓" : "✕"} {m.brand}
                    </Badge>
                  ))}
                </div>
                <p className="text-xs italic text-muted-foreground">&quot;{check.answer.slice(0, 280)}{check.answer.length > 280 ? "…" : ""}&quot;</p>
              </Card>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
