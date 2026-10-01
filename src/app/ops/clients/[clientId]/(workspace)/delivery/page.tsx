import { redirect } from "next/navigation";
import { getOpsViewer } from "@/lib/current-viewer";
import { resolveLegacyDelivery } from "@/lib/ops-routes";

export default async function LegacyDeliveryIndexPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ project?: string }> }) {
  await getOpsViewer();
  const { clientId } = await params;
  const { project } = await searchParams;
  redirect(await resolveLegacyDelivery(clientId, undefined, project));
}
