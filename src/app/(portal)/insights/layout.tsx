import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { lastUpdated } from "@/lib/insights-data";
import { WORK_TZ } from "@/lib/working-hours";
import { AskPill } from "@/components/portal/insights/ask-pill";
import { NoAdAccount } from "@/components/portal/insights/no-ad-account";
import { adDataStatus } from "@/lib/integrations/live-ads-owner";
import { isClientAdmin } from "@/lib/client-roles";
import { SectionShell } from "@/components/shared/section-shell";
import { InsightsChips, InsightsMenu, type MenuData } from "@/components/insights/insights-menu";
import { InsightsHeader } from "@/components/insights/insights-header";
import { insightsSourceStatus, tabSourceLine } from "@/lib/insights/source-status";
import { TABS, type TabKey } from "@/lib/insights/tabs";
import { jsonArray } from "@/lib/utils";
import { Suspense } from "react";

/** "UPDATED TODAY 09:40", "UPDATED 30 SEPT 14:10". */
function updatedLabel(at: Date, now: Date) {
  const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  const when = day(at) === day(now) ? "today" : new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, day: "numeric", month: "short" }).format(at);
  return `Updated ${when} ${time}`;
}

/**
 * Insights (Phase X v2): the main nav folds to the icon strip, the Insights menu sits beside it (Overview · Your
 * channels · Your sales · Your market), and every tab gets the same header: the block's crumb, the title, the
 * question it answers, Ask, the period and "Share as report".
 */
export default async function InsightsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  const now = new Date();
  const [questions, adStatus, status, client] = await Promise.all([
    prisma.marketIntelligenceQuestion.findMany({ where: { clientId: viewer.clientId }, orderBy: { createdAt: "desc" }, take: 5 }),
    adDataStatus(viewer.clientId),
    insightsSourceStatus(viewer.clientId),
    prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId }, select: { competitorBrands: true, industry: true } }),
  ]);
  const updated = status.lastSync ?? (await lastUpdated(viewer.clientId));
  const month = new Intl.DateTimeFormat("en-GB", { timeZone: WORK_TZ, month: "long", year: "numeric" }).format(now);
  const n = status.sources.length;
  const competitors = jsonArray<string>(client.competitorBrands).length;
  const subs = Object.fromEntries(TABS.map((t) => [t.key, tabSourceLine(status.sources, t.key, t.sources)])) as Record<TabKey, string>;
  if (competitors) subs.competitors = `${competitors + 1} brands tracked`;
  if (client.industry) subs.trends = client.industry;

  const menu: MenuData = {
    freshness: [`${month} · ${n === 1 ? "1 source" : `${n} sources`}`, ...(updated ? [updatedLabel(updated, now)] : [])],
    subs,
    dots: status.dots,
    issues: status.attention.length,
    sourcesHref: "/settings/connections",
  };
  const ask = <AskPill recent={questions.map((q) => ({ id: q.id, question: q.question, answer: q.answer, sources: q.sources as string[] | null, dataSize: q.dataSize, confidence: q.confidence }))} notice={adStatus === "none" ? <NoAdAccount admin={isClientAdmin(viewer)} compact /> : undefined} />;

  return (
    <SectionShell
      menu={
        <Suspense>
          <InsightsMenu data={menu} />
        </Suspense>
      }
      chips={
        <Suspense>
          <InsightsChips data={menu} />
        </Suspense>
      }
    >
      <div className="@container/page flex flex-col gap-6">
        <Suspense>
          <InsightsHeader ask={ask} />
        </Suspense>
        {children}
      </div>
    </SectionShell>
  );
}
