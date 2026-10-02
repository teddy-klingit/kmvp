import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { formatLabel } from "@/lib/asset-display";
import { filtersToQueryString, type ReportFilters } from "@/lib/report-filters";
import { loadMeasuredAssets } from "@/lib/insights-data";
import { loadSchedule, periodFor, reportAssets, reportTakeaways, WEEKDAYS, type Period, type ReportKind } from "@/lib/report-data";
import { writeReportNowAction } from "@/lib/actions/report-actions";
import { SectionCard, CardRows, CardNote, Card } from "@/components/ds/card";
import { NumberedRow } from "@/components/ds/numbered-row";
import { monoLink } from "@/components/ds/pill-link";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { ChangeScheduleDialog } from "@/components/portal/reports/change-schedule-dialog";

type Report = { id: string; kind: string; periodStart: Date; label: string; takeaways: unknown; topAssetIds: unknown; generatedAt: Date };

/** A report's three numbered takeaways, or how it gets written when it doesn't exist yet. */
export function TakeawaysCard({ period, report, action }: { period: Period; report: Report | null; action?: React.ReactNode }) {
  return (
    <SectionCard title={period.kind === "MONTHLY" ? period.label : `${period.label} · ${period.range}`} label="Latest report" action={action}>
      {report ? (
        <CardRows as="ol">
          {reportTakeaways(report).map((t, i) => (
            <NumberedRow key={i} n={i + 1} title={t.title} detail={t.detail} />
          ))}
        </CardRows>
      ) : (
        <div className="flex flex-wrap items-center gap-4 px-6 py-5">
          <p className="m-0 min-w-0 flex-1 basis-[260px] text-[14px] text-brand-ink-2">The performance agent writes this report once the period has closed. It appears here, and goes out on your schedule.</p>
          <AgentButton action={writeReportNowAction} fields={{ kind: period.kind }} label="Write it now" pendingLabel="Writing…" />
        </div>
      )}
    </SectionCard>
  );
}

/** Top creative with its measured CTR: the report's, or the best right now when there's no report yet. */
export async function TopPostsCard({ clientId, report }: { clientId: string; report: Report | null }) {
  const assets = report ? await reportAssets(clientId, report.topAssetIds) : [...(await loadMeasuredAssets(clientId)).measured].sort((a, b) => b.ctr - a.ctr).slice(0, 3);
  if (assets.length === 0) return null;
  return (
    <SectionCard title="Top posts" action={!report ? <span className="text-[12px] text-brand-ink-2">Measured CTR so far</span> : undefined}>
      <div className="grid grid-cols-1 gap-4 px-6 pb-6 pt-5 @min-[600px]/col:grid-cols-3">
        {assets.map((a) => (
          <div key={a.id} className="flex min-w-0 flex-col gap-2">
            <span aria-hidden className="block aspect-[16/7] rounded-[8px] @min-[600px]/col:aspect-[11/6]" style={{ backgroundColor: a.color ? `color-mix(in srgb, ${a.color} 16%, white)` : "var(--brand-chip)" }} />
            <span className="truncate text-[15px]">{a.title}</span>
            <span className="text-[13px] text-brand-ink-2">
              {a.ctr.toFixed(1)}% CTR · {formatLabel(a.format).split(" · ")[0]}
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

const SUB: Record<string, string> = { WEEKLY: "weekly", MONTHLY: "Monthly report" };

/** Past reports: earlier weekly and monthly reports, and the client's own custom ones. */
export async function PastReportsCard({ clientId, exclude }: { clientId: string; exclude: string[] }) {
  const [generated, saved] = await Promise.all([
    prisma.generatedReport.findMany({ where: { clientId, id: { notIn: exclude } }, orderBy: { periodStart: "desc" }, take: 6 }),
    prisma.savedReport.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 3 }),
  ]);
  const rows = [
    ...generated.map((g) => {
      const p = periodFor(g.kind as ReportKind, g.periodStart);
      return { id: g.id, at: g.periodStart, title: g.kind === "MONTHLY" ? new Intl.DateTimeFormat("en-GB", { month: "long" }).format(g.periodStart) : g.label, sub: g.kind === "MONTHLY" ? SUB.MONTHLY : `${p.range} · weekly`, href: `/reports/${g.kind === "MONTHLY" ? "monthly" : "weekly"}/${g.id}` };
    }),
    ...saved.map((s) => ({ id: s.id, at: s.createdAt, title: s.name, sub: "Custom · built by you", href: `/reports/custom?${filtersToQueryString(s.filters as ReportFilters)}` })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return (
    <SectionCard title="Past reports">
      {rows.length === 0 ? (
        <CardNote>Your earlier reports collect here.</CardNote>
      ) : (
        <CardRows>
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={r.href} className="flex min-h-11 items-center gap-3 px-6 py-3.5 text-brand-ink no-underline hover:bg-brand-chip">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[15px]">{r.title}</span>
                  <span className="text-[13px] text-brand-ink-2">{r.sub}</span>
                </span>
                <ArrowRight className="size-4" strokeWidth={1.75} />
              </Link>
            </li>
          ))}
        </CardRows>
      )}
    </SectionCard>
  );
}

/** "Sent every Monday 08:00 · To …". */
export async function ScheduleCard({ clientId }: { clientId: string }) {
  const s = await loadSchedule(clientId);
  const names = s.recipients.map((r) => r.name);
  const to = names.length === 0 ? "No one yet" : names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  return (
    <Card tone="muted" aria-label="Send schedule" className="flex flex-col gap-3 px-6 py-5">
      <span className="text-[16px]">
        Sent every {WEEKDAYS[s.day - 1]} {s.time}
      </span>
      <span className="text-[13px] leading-[1.55] text-brand-ink-2">To {to}. {s.cadence === "MONTHLY" ? "Monthly" : "Weekly"} report from your SOW.</span>
      <ChangeScheduleDialog day={s.day} time={s.time} team={s.team} />
    </Card>
  );
}

export { monoLink };
