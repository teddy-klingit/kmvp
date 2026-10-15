import { getOpsViewer } from "@/lib/current-viewer";
import { roleTierFor } from "@/lib/role-tier";
import { TodayHome } from "@/components/ops/today/today-home";
import { CreatorHome } from "@/components/ops/home/creator-home";
import { scheduleAutopilot } from "@/lib/autopilot-schedule";
import { scopeFor } from "@/lib/staff-scope";

/**
 * Today (Phase T): a PM's day, one row per decision, across their clients (Mine, the PM default) or all PMs'.
 * Creators keep their assignments view.
 */
export default async function OpsHomePage({ searchParams }: { searchParams: Promise<{ scope?: string; client?: string }> }) {
  const viewer = await getOpsViewer();
  const tier = roleTierFor(viewer.title);
  if (tier === "CREATOR") return <CreatorHome viewer={viewer} />;
  scheduleAutopilot();
  const q = await searchParams;
  return <TodayHome viewer={viewer} scope={await scopeFor(viewer, q.scope)} client={q.client} />;
}
