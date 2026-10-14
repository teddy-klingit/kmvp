import { getOpsViewer } from "@/lib/current-viewer";
import { roleTierFor } from "@/lib/role-tier";
import { NeedsYouHome } from "@/components/ops/home/needs-you-home";
import { CreatorHome } from "@/components/ops/home/creator-home";
import { scheduleAutopilot } from "@/lib/autopilot-schedule";
import { loadInbox } from "@/lib/ops-inbox";
import { scopeFor } from "@/lib/staff-scope";

/**
 * Today (Phase S): PMs and admins get one urgency-sorted list across their clients (Mine, the PM default) or all
 * (the admin default), plus what's running on its own. Creators keep their assignments view.
 */
export default async function OpsHomePage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const viewer = await getOpsViewer();
  const tier = roleTierFor(viewer.title);
  if (tier === "CREATOR") return <CreatorHome viewer={viewer} />;
  scheduleAutopilot();
  const [{ count }, scope] = await Promise.all([loadInbox(), scopeFor(viewer, (await searchParams).scope)]);
  return <NeedsYouHome viewer={viewer} inboxCount={count} scope={scope} />;
}
