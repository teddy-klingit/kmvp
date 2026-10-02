import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { lastUpdated, loadDemoSources, loadPaidMedia } from "@/lib/insights-data";
import { WORK_TZ } from "@/lib/working-hours";
import { SegmentedNav } from "@/components/ds/segmented-control";
import { AskPill } from "@/components/portal/insights/ask-pill";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { TabRowEnd } from "@/components/insights/toolbar";
import { generateSeoReportAction } from "@/lib/actions/seo-actions";
import { Suspense } from "react";

const SECTIONS = [
  { label: "Overview", href: "/insights" },
  { label: "Performance", href: "/insights/performance" },
  { label: "Market", href: "/insights/market" },
  { label: "Audience", href: "/insights/audience" },
  { label: "SEO & AI visibility", href: "/insights/seo" },
];

/** "UPDATED TODAY 09:00", "UPDATED 30 SEPT 14:10". */
function updatedLabel(at: Date, now: Date) {
  const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  const when = day(at) === day(now) ? "TODAY" : new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short" }).format(at).toUpperCase();
  return `UPDATED ${when} ${time}`;
}

/**
 * Insights v2 (Insights{Overview,…}.dc.html): one header with Ask, the tabs, and on the right of the tab row
 * the date range (Overview) or "Run audit again" (SEO). The other tabs put the range on their chip row.
 */
export default async function InsightsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  const [paid, questions, demo, audits] = await Promise.all([
    loadPaidMedia(viewer.clientId),
    prisma.marketIntelligenceQuestion.findMany({ where: { clientId: viewer.clientId }, orderBy: { createdAt: "desc" }, take: 5 }),
    loadDemoSources(viewer.clientId),
    prisma.siteAudit.count({ where: { clientId: viewer.clientId } }),
  ]);
  // After loadPaidMedia: reading the ad accounts may have just written a fresh snapshot.
  const updated = paid.isSample ? null : await lastUpdated(viewer.clientId);
  const eyebrow = [
    updated && updatedLabel(updated, new Date()),
    paid.inScope ? (paid.connected.length ? `${paid.connected.join(" + ")} CONNECTED${paid.isSample ? " · SAMPLE DATA" : ""}` : "NO AD ACCOUNTS CONNECTED") : "ORGANIC ONLY",
    demo.length ? `${demo.join(" + ")}: DEMO DATA` : null,
  ]
    .filter(Boolean)
    .join(" · ")
    .toUpperCase();

  return (
    <div className="@container/page mx-auto flex max-w-[1120px] flex-col gap-6">
      <header className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="font-brand-mono text-[12px] text-brand-ink-2">{eyebrow}</span>
          <h1 className="m-0 text-[32px] font-light leading-[1.15] tracking-[0.01em] min-[700px]:text-[36px]">Insights</h1>
        </div>
        <AskPill recent={questions.map((q) => ({ id: q.id, question: q.question, answer: q.answer }))} />
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedNav label="Insights sections" items={SECTIONS} />
        <Suspense>
          <TabRowEnd seo={viewer.client.website ? <AgentButton action={generateSeoReportAction} label={audits ? "Run audit again" : "Run audit"} pendingLabel="Auditing sites…" /> : null} />
        </Suspense>
      </div>
      {children}
    </div>
  );
}
