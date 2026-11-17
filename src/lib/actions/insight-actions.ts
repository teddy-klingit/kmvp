"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { sendPmMessage } from "@/lib/pm-thread";
import { askKey, askedInsightKey, upsertInsight } from "@/lib/insight-records";

export type AskIdeaState = { ok?: boolean; error?: string };

/**
 * "Ask for an idea" on a finding (Phase X v2): an opportunity request linked to the finding, hidden from the client
 * until the PM has written it up (Phase W: staff link and show it), and a message to the PM so they know. Asking twice
 * about the same finding does nothing new.
 */
export async function askForIdeaAction(_prev: AskIdeaState, formData: FormData): Promise<AskIdeaState> {
  const viewer = await getPortalViewer();
  // A community question or a trend has no finding yet: it becomes one (only this client's), then the ask is the same.
  const question = String(formData.get("question") ?? "").trim().slice(0, 200);
  const made = question
    ? await upsertInsight(viewer.clientId, {
        key: askedInsightKey(String(formData.get("about") ?? "question"), question),
        kind: "data",
        title: question,
        value: String(formData.get("value") ?? "").slice(0, 40) || "Asked",
        sources: String(formData.get("sources") ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 4),
        href: String(formData.get("href") ?? "") || null,
        origin: "client",
      })
    : null;
  const insight = made ?? (await prisma.insight.findFirst({ where: { id: String(formData.get("insightId") ?? ""), clientId: viewer.clientId } }));
  if (!insight) return { error: "That finding isn't there anymore." };
  const sourceKey = askKey(insight.id);
  if (await prisma.opportunity.findUnique({ where: { clientId_sourceKey: { clientId: viewer.clientId, sourceKey } }, select: { id: true } })) return { ok: true };
  const about = `“${insight.title}” (${insight.value})`;
  await prisma.opportunity.create({
    data: {
      clientId: viewer.clientId,
      title: `Idea for ${insight.title}`,
      summary: `${viewer.user.name} asked for an idea from this finding: ${about}.`,
      sources: insight.sources ?? [],
      insightHref: insight.href,
      origin: "ask",
      hiddenAt: new Date(),
      sourceKey,
      isDemo: viewer.client.isDemo,
      createdByUserId: viewer.userId,
      insights: { create: [{ insightId: insight.id, sortOrder: 0 }] },
    },
  });
  await sendPmMessage({ clientId: viewer.clientId, author: { userId: viewer.userId, clientUserId: viewer.id, name: viewer.user.name }, body: `Could you look for an idea? About ${about}.` });
  await prisma.auditLog.create({ data: { clientId: viewer.clientId, actorUserId: viewer.userId, area: "opportunities", action: `Asked for an idea about ${about.slice(0, 140)}` } });
  revalidatePath("/insights", "layout");
  return { ok: true };
}
