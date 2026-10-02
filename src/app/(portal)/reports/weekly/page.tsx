import { getPortalViewer } from "@/lib/current-viewer";
import { loadSowData, WeeklySow } from "@/components/portal/reports/sow-sections";
import { PageGrid } from "@/components/ds/page-grid";
import { ScheduleCard } from "@/components/portal/reports/report-cards";

/** The full weekly report: every bullet of SOW Section 7, filled with the data as it stands now. */
export default async function FullWeeklyReportPage() {
  const viewer = await getPortalViewer();
  const data = await loadSowData(viewer.clientId);
  return (
    <>
      <span className="font-brand-mono text-[12px] text-brand-ink-2">FULL WEEKLY REPORT · SOW SECTION 7 · LIVE DATA</span>
      <PageGrid main={<WeeklySow data={data} />} side={<ScheduleCard clientId={viewer.clientId} />} />
    </>
  );
}
