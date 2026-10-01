import { redirect } from "next/navigation";
import { getOpsViewer } from "@/lib/current-viewer";
import { resolveLegacyDelivery } from "@/lib/ops-routes";

/** Old 10-tab delivery view: every project now has its own cockpit at /ops/projects/[projectId]. */
export default async function LegacyDeliveryStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string; stage: string }>;
  searchParams: Promise<{ project?: string }>;
}) {
  await getOpsViewer();
  const { clientId, stage } = await params;
  const { project } = await searchParams;
  redirect(await resolveLegacyDelivery(clientId, stage, project));
}
