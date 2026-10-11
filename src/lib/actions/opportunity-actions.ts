"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getPortalViewer } from "@/lib/current-viewer";
import { withAiCharge, assistantCharge, ASSISTANTS } from "@/lib/ai-context";
import { addPlanItem } from "@/lib/plan";
import { startBriefForItem } from "@/lib/plan-brief";
import { addAnotherRoute, dismissOpportunity, loadOpportunity, markRoute, runOpportunityScan } from "@/lib/opportunities";
import { jsonArray } from "@/lib/utils";

/** Plan → Opportunities (Phase R step 4). Every action is scoped to the signed-in client. */

function refresh(id?: string) {
  revalidatePath("/plan", "layout");
  if (id) revalidatePath(`/plan/opportunities/${id}`);
  revalidatePath("/dashboard");
}

/** Not for us: the reason is stored and steers the next scans. */
export async function dismissOpportunityAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const id = String(formData.get("id") ?? "");
  await dismissOpportunity(viewer.clientId, viewer.userId, id, String(formData.get("reason") ?? ""));
  refresh(id);
  if (formData.get("back") === "1") redirect("/plan/opportunities?dismissed=1");
}

export type AskState = { error?: string; ok?: string };

/** Ask for more: a scan now, on the client's AI credits (the weekly one is Klingit's). */
export async function askForMoreAction(): Promise<AskState> {
  const viewer = await getPortalViewer();
  if (viewer.client.isDemo) return { error: "This is a demo account: its opportunities are seeded." };
  const r = await withAiCharge(assistantCharge(viewer.clientId, viewer.userId, ASSISTANTS.opportunities), () => runOpportunityScan(viewer.clientId, { origin: "ask", userId: viewer.userId, max: 2 }));
  refresh();
  if (r.error) return { error: r.error };
  return { ok: r.created ? `${r.created} new opportunit${r.created === 1 ? "y" : "ies"}.` : "Nothing new worth suggesting right now." };
}

/** Ask for another route (AI credits). */
export async function anotherRouteAction(_prev: AskState, formData: FormData): Promise<AskState> {
  const viewer = await getPortalViewer();
  const id = String(formData.get("id") ?? "");
  if (viewer.client.isDemo) return { error: "This is a demo account: its routes are seeded." };
  const r = await withAiCharge(assistantCharge(viewer.clientId, viewer.userId, ASSISTANTS.opportunities), () => addAnotherRoute(viewer.clientId, id, viewer.userId));
  refresh(id);
  return r.error ? { error: r.error } : { ok: "Added a route." };
}

/**
 * Brief Klingit on one route: it goes on the plan (Klingit helps, on the window's last day; once per route) and the
 * brief assistant opens with the route and the evidence.
 */
export async function briefRouteAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const o = await loadOpportunity(viewer.clientId, String(formData.get("id") ?? ""));
  if (!o) return;
  const route = o.routes.find((r) => r.letter === String(formData.get("route") ?? "")) ?? o.routes[0];
  const live = o.windowEnd ?? o.windowStart ?? new Date(Date.now() + 21 * 86400000);
  const { item } = await addPlanItem(
    viewer.clientId,
    viewer.userId,
    { title: o.title, date: live, channels: route ? jsonArray<string>(route.channels) : [], formats: route ? jsonArray<string>(route.formats) : [], maker: "klingit_help", notes: route ? `${route.name}: ${route.description}` : o.summary, opportunityId: o.id, route: route?.letter ?? null },
    `opp-${o.id}-${route?.letter ?? "A"}`
  );
  await markRoute(viewer.clientId, o.id, route?.letter ?? null, "added", { planItemId: item.id });
  const projectId = await startBriefForItem(viewer, item.id);
  refresh(o.id);
  if (projectId) redirect(`/brief/${projectId}`);
}

