import { getOpsViewer } from "@/lib/current-viewer";
import { roleTierFor } from "@/lib/role-tier";
import { AdminHome } from "@/components/ops/home/admin-home";
import { PmHome } from "@/components/ops/home/pm-home";
import { CreatorHome } from "@/components/ops/home/creator-home";

export default async function OpsHomePage() {
  const viewer = await getOpsViewer();
  const tier = roleTierFor(viewer.title);

  if (tier === "PM") return <PmHome viewer={viewer} />;
  if (tier === "CREATOR") return <CreatorHome viewer={viewer} />;
  return <AdminHome viewer={viewer} />;
}
