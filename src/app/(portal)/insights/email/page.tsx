import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { connectHref } from "@/lib/insights-data";
import { PillLink } from "@/components/ds/pill-link";
import { ChartCard, SkeletonChart } from "@/components/insights/cards";
import { BlindSpots, Blurred, KeyNumbers } from "@/components/insights/tab-parts";

/**
 * Insights → Email (Phase X v2): "Do our newsletters and automatic emails sell?" Until the tab's own views land
 * (flows vs newsletters, best and worst emails, list health), email's sales are on Sales; without Klaviyo it shows
 * what connecting unlocks, blurred, never zeros.
 */
export default async function EmailPage() {
  const viewer = await getPortalViewer();
  const klaviyo = await prisma.dataSource.findUnique({ where: { clientId_source: { clientId: viewer.clientId, source: "Klaviyo" } }, select: { status: true } });
  const connect = await connectHref(viewer.clientId);
  if (klaviyo?.status === "connected") {
    return (
      <ChartCard title="Email">
        <SkeletonChart line="Flows, newsletters and list health get their own views here. Until then, what email sold is on Sales." action={<PillLink href="/insights/sales">See Sales</PillLink>} />
      </ChartCard>
    );
  }
  const reconnect = klaviyo?.status === "needs_reconnect" || klaviyo?.status === "error";
  return (
    <div className="flex flex-col gap-6">
      <Blurred line="Connect Klaviyo to see what your newsletters and automatic flows sell, and how healthy your list is." action={{ label: reconnect ? "Reconnect Klaviyo" : "Connect Klaviyo", href: connect }}>
        <KeyNumbers
          items={[
            { label: "Sales from email", value: "€00k", spark: [3, 4, 4, 5, 6] },
            { label: "Subscribers", value: "00.0k", spark: [3, 3, 4, 4, 5] },
            { label: "Open rate", value: "00%", spark: [4, 5, 4, 4, 4] },
            { label: "Click rate", value: "0.0%", spark: [2, 3, 3, 3, 4] },
          ]}
        />
      </Blurred>
      <BlindSpots items={[{ text: reconnect ? "Klaviyo needs reconnecting: email numbers stopped coming in." : "Klaviyo isn’t connected, so we can’t see what email sells.", action: { label: reconnect ? "Reconnect" : "Connect", href: connect } }]} />
    </div>
  );
}
