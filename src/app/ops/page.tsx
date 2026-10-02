import { getOpsViewer } from "@/lib/current-viewer";
import { roleTierFor } from "@/lib/role-tier";
import { NeedsYouHome } from "@/components/ops/home/needs-you-home";
import { CreatorHome } from "@/components/ops/home/creator-home";
import { scheduleAutopilot } from "@/lib/autopilot-schedule";
import { loadInbox } from "@/lib/ops-inbox";

/** PM and Admin home is "Needs you": only the exceptions, plus what's running on its own. Creators keep their assignments view. */
export default async function OpsHomePage() {
  const viewer = await getOpsViewer();
  const tier = roleTierFor(viewer.title);
  if (tier === "CREATOR") return <CreatorHome viewer={viewer} />;
  scheduleAutopilot();
  const { count } = await loadInbox();
  return <NeedsYouHome viewer={viewer} inboxCount={count} />;
}
