import Link from "next/link";
import { getPortalViewer } from "@/lib/current-viewer";
import { loadReports } from "@/lib/report-data";
import { PageGrid } from "@/components/ds/page-grid";
import { Card } from "@/components/ds/card";
import { monoLink } from "@/components/ds/pill-link";
import { TakeawaysCard, TopPostsCard, PastReportsCard, ScheduleCard } from "@/components/portal/reports/report-cards";

/** Reports → Weekly (Reports.dc.html): the latest closed week as 3 takeaways + top posts; past reports and the schedule on the side. */
export default async function WeeklyReportPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  const viewer = await getPortalViewer();
  const { latest, current } = await loadReports(viewer.clientId, "WEEKLY");
  return (
    <>
      {sent === "1" && (
        <Card tone="muted" className="px-6 py-4 text-[14px]">
          Sent. Your team will find it in the channel you picked.
        </Card>
      )}
      <PageGrid
        main={
          <>
            <TakeawaysCard
              period={latest}
              report={current}
              action={
                <Link href="/reports/weekly" className={monoLink}>
                  OPEN FULL REPORT
                </Link>
              }
            />
            <TopPostsCard clientId={viewer.clientId} report={current} />
          </>
        }
        side={
          <>
            <PastReportsCard clientId={viewer.clientId} exclude={current ? [current.id] : []} />
            <ScheduleCard clientId={viewer.clientId} />
          </>
        }
      />
    </>
  );
}
