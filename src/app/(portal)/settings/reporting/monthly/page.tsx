import { getPortalViewer } from "@/lib/current-viewer";
import { loadReports } from "@/lib/report-data";
import { loadSowData, MonthlySow } from "@/components/portal/reports/sow-sections";
import { PageGrid } from "@/components/ds/page-grid";
import { TakeawaysCard, PastReportsCard, ScheduleCard } from "@/components/portal/reports/report-cards";

/** Reports → Monthly: last month's report (3 takeaways) and this month's SOW 7.2 sections so far. */
export default async function MonthlyReportPage() {
  const viewer = await getPortalViewer();
  const [{ latest, current }, data] = await Promise.all([loadReports(viewer.clientId, "MONTHLY"), loadSowData(viewer.clientId)]);
  const now = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date());
  return (
    <PageGrid
      main={
        <>
          <TakeawaysCard period={latest} report={current} />
          <span className="pt-2 font-brand-mono text-[12px] text-brand-ink-2">{now.toUpperCase()} SO FAR · SOW SECTION 7.2</span>
          <MonthlySow data={data} />
        </>
      }
      side={
        <>
          <PastReportsCard clientId={viewer.clientId} exclude={current ? [current.id] : []} />
          <ScheduleCard clientId={viewer.clientId} />
        </>
      }
    />
  );
}
