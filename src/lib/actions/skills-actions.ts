"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { withAiCharge, assistantCharge, ASSISTANTS } from "@/lib/ai-context";
import { aiGate } from "@/lib/ai-credits";
import { findSkill, type SkillFit } from "@/lib/skill-router";
import { createKlingitRequest } from "@/lib/klingit-requests";

export type FindSkillState = { request?: string; fit?: SkillFit | null; error?: string | null; searched?: boolean };

/** "What do you want to make?": the skill finder, as an assistant use of the client's AI credits. */
export async function findSkillAction(_prev: FindSkillState, formData: FormData): Promise<FindSkillState> {
  const viewer = await getPortalViewer();
  const request = String(formData.get("request") ?? "").trim();
  if (!request) return { error: "Write what you want to make first." };
  const gate = await aiGate(viewer.clientId, "assistant");
  if (!gate.ok) return { request, error: gate.error };
  const r = await withAiCharge(assistantCharge(viewer.clientId, viewer.userId, ASSISTANTS.skillFinder), () => findSkill(viewer.clientId, request, viewer.userId));
  return { request, fit: r.fit, error: r.error, searched: true };
}

export type AskKlingitState = { ok?: string; projectId?: string; error?: string };

/**
 * "Ask Klingit" on a skill Klingit runs, or from the skill finder when nothing fits: a small request for the PM,
 * with the skill's team-credit estimate (a placeholder) as the starting quote. It shows on Ongoing projects.
 */
export async function askKlingitAction(_prev: AskKlingitState, formData: FormData): Promise<AskKlingitState> {
  const viewer = await getPortalViewer();
  const text = String(formData.get("text") ?? "").trim();
  const skillId = String(formData.get("skillId") ?? "");
  const skill = skillId ? await prisma.agent.findFirst({ where: { id: skillId, kind: "SKILL", OR: [{ clientId: null }, { clientId: viewer.clientId }] } }) : null;
  if (!text) return { error: "Tell Klingit what you need." };
  const projectId = await createKlingitRequest(viewer, {
    name: skill ? `${skill.name}: ${text.split(/[.\n]/)[0].slice(0, 50)}` : text.split(/[.\n]/)[0].slice(0, 70),
    text: skill ? `${skill.name} (run by Klingit). ${text}` : text,
    event: skill ? `Asked Klingit to run ${skill.name}` : "Asked Klingit from Skills",
    send: true,
    teamCredits: skill?.teamCreditsEstimate ?? null,
  });
  revalidatePath("/projects");
  revalidatePath("/skills");
  return { ok: "Sent to Klingit. It's on Ongoing projects; the estimate follows.", projectId };
}
