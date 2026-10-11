import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { periodFor } from "@/lib/report-data";
import { PageGrid } from "@/components/ds/page-grid";
import { TakeawaysCard, TopPostsCard, PastReportsCard } from "@/components/portal/reports/report-cards";

/** A past weekly report, as it was written. Scoped to the signed-in client. */
export default async function PastWeeklyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getPortalViewer();
  const report = await prisma.generatedReport.findFirst({ where: { id, clientId: viewer.clientId, kind: "WEEKLY" } });
  if (!report) notFound();
  return (
    <PageGrid
      main={
        <>
          <TakeawaysCard period={periodFor("WEEKLY", report.periodStart)} report={report} />
          <TopPostsCard clientId={viewer.clientId} report={report} />
        </>
      }
      side={<PastReportsCard clientId={viewer.clientId} exclude={[report.id]} />}
    />
  );
}
