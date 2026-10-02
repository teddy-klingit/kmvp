import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { periodFor } from "@/lib/report-data";
import { PageGrid } from "@/components/ds/page-grid";
import { TakeawaysCard, TopPostsCard, PastReportsCard } from "@/components/portal/reports/report-cards";

/** A past monthly report, as it was written. Scoped to the signed-in client. */
export default async function PastMonthlyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getPortalViewer();
  const report = await prisma.generatedReport.findFirst({ where: { id, clientId: viewer.clientId, kind: "MONTHLY" } });
  if (!report) notFound();
  return (
    <PageGrid
      main={
        <>
          <TakeawaysCard period={periodFor("MONTHLY", report.periodStart)} report={report} />
          <TopPostsCard clientId={viewer.clientId} report={report} />
        </>
      }
      side={<PastReportsCard clientId={viewer.clientId} exclude={[report.id]} />}
    />
  );
}
