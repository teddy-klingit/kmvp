import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { connectHref } from "@/lib/insights-data";
import { PillLink } from "@/components/ds/pill-link";
import { ChartCard, SkeletonChart } from "@/components/insights/cards";

/**
 * Insights → Email (Phase X v2): "Do our newsletters and automatic emails sell?" Until the tab's own views land
 * (flows vs newsletters, best and worst emails, list health), email's sales are on Sales; without Klaviyo it
 * says what connecting unlocks, never zeros.
 */
export default async function EmailPage() {
  const viewer = await getPortalViewer();
  const klaviyo = await prisma.dataSource.findUnique({ where: { clientId_source: { clientId: viewer.clientId, source: "Klaviyo" } }, select: { status: true } });
  const connected = klaviyo?.status === "connected";
  return (
    <ChartCard title={connected ? "Email" : "What we can't see yet"}>
      {connected ? (
        <SkeletonChart line="Flows, newsletters and list health get their own views here. Until then, what email sold is on Sales." action={<PillLink href="/insights/sales">See Sales</PillLink>} />
      ) : (
        <SkeletonChart line="Connect Klaviyo to see what your newsletters and automatic flows sell, and how healthy your list is." action={<PillLink href={await connectHref(viewer.clientId)}>Connect Klaviyo</PillLink>} />
      )}
    </ChartCard>
  );
}
