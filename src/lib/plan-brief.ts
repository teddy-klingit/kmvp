import { prisma } from "@/lib/prisma";
import type { PortalViewer } from "@/lib/brief-intake";
import { withAiCharge, assistantCharge, ASSISTANTS } from "@/lib/ai-context";
import { startStudio } from "@/lib/brief-studio/studio";
import { startBriefText } from "@/lib/plan";
import { briefExtras, markRoute } from "@/lib/opportunities";

/**
 * Start brief for a plan item: a draft in the brief assistant with everything the plan knows (and, for an item made
 * from an opportunity, its route and evidence), so the assistant doesn't ask again. The item follows that project.
 * Returns the project to open, or null when the item isn't this client's.
 */
export async function startBriefForItem(viewer: PortalViewer, itemId: string) {
  const item = await prisma.clientCalendarItem.findFirst({ where: { id: itemId, clientId: viewer.clientId, archivedAt: null } });
  if (!item) return null;
  if (item.projectId) return item.projectId;
  const extras = item.opportunityId ? await briefExtras(viewer.clientId, item.opportunityId, item.route) : {};
  const projectId = await withAiCharge(assistantCharge(viewer.clientId, viewer.userId, ASSISTANTS.brief), () => startStudio(viewer, startBriefText(item, extras)));
  await prisma.clientCalendarItem.update({ where: { id: item.id }, data: { projectId, maker: item.maker === "client" ? "klingit_help" : item.maker } });
  if (item.opportunityId) await markRoute(viewer.clientId, item.opportunityId, item.route, "briefed", { planItemId: item.id, projectId });
  return projectId;
}
