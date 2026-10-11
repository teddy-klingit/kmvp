import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { lastClosed, loadSchedule, WEEKDAYS } from "@/lib/report-data";
import { SettingsHeader } from "@/components/portal/settings-header";
import { ReportHeaderActions } from "@/components/portal/reports/report-header-actions";

/** Settings → Reporting (Reports.dc.html): Weekly · Monthly · Custom as chips under the settings tabs. */
export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  const week = lastClosed("WEEKLY");
  const month = lastClosed("MONTHLY");
  const [ready, channels, schedule] = await Promise.all([
    prisma.generatedReport.findUnique({ where: { clientId_kind_periodStart: { clientId: viewer.clientId, kind: "WEEKLY", periodStart: week.start } }, select: { generatedAt: true } }),
    prisma.connectedChannel.findMany({ where: { clientId: viewer.clientId }, orderBy: { connectedAt: "asc" } }),
    loadSchedule(viewer.clientId),
  ]);
  const eyebrow = ready
    ? `${week.label} report ready · ${new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(ready.generatedAt)}`
    : `Next report ${WEEKDAYS[schedule.day - 1]} ${schedule.time}`;
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        eyebrow={eyebrow}
        title="Reporting"
        actions={<ReportHeaderActions channels={channels} weeklyLabel={`${week.label} · ${week.range}`} monthlyLabel={month.label} />}
        chipsLabel="Report type"
        chips={[
          { label: "Weekly", href: "/settings/reporting" },
          { label: "Monthly", href: "/settings/reporting/monthly" },
          { label: "Custom", href: "/settings/reporting/custom" },
        ]}
      />
      {children}
    </div>
  );
}
