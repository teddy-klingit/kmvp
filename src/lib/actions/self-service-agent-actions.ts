"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import type { Agent } from "@/generated/prisma";
import { aiGate } from "@/lib/ai-credits";
import { saveSkillOutput } from "@/lib/skill-outputs";
import { runCustomSkill } from "@/lib/ai/agents/self-serve/custom-skill";
import { withAiCharge } from "@/lib/ai-context";
import { generateSelfServeBrief } from "@/lib/ai/agents/self-serve/brief-generator";
import { generateSelfServeAdConcept } from "@/lib/ai/agents/self-serve/ad-concept-generator";
import { generateSelfServeImage } from "@/lib/ai/agents/self-serve/image-gen-agent";
import { loadBrandForAgents } from "@/lib/brand-rules";
import { editVersion, redoVersion, retryImage, runSkillBatch, type RunSettings } from "@/lib/skill-run";
import { createKlingitRequest } from "@/lib/klingit-requests";
import { toPlainText } from "@/lib/skill-output-text";

/** ≈ team credits for Klingit to polish one skill version (a placeholder until priced). */
const POLISH_TEAM_CREDITS = 2;
import {
  generateLinkedInPost,
  generateLandingPageCopy,
  generateInstagramCaption,
  generateEmailCopy,
} from "@/lib/ai/agents/self-serve/niche-copy-agents";

export type SelfServiceAgentState = { error?: string | null; topUp?: boolean };

export async function runSelfServiceAgentAction(
  _prev: SelfServiceAgentState,
  formData: FormData
): Promise<SelfServiceAgentState> {
  const viewer = await getPortalViewer();
  const agentId = String(formData.get("agentId") ?? "");

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return { error: "Skill not found." };
  if (!agent.selfService && !(agent.kind === "SKILL" && agent.clientId === viewer.clientId)) return { error: "This skill isn't available to run yourself." };
  // AI credits: a skill run is blocked when none are left (src/lib/ai-credits.ts); every call inside is charged.
  const gate = await aiGate(viewer.clientId, "skill");
  if (!gate.ok) return { error: gate.error, topUp: gate.topUp };
  return withAiCharge({ clientId: viewer.clientId, userId: viewer.userId, sourceType: "skill", sourceKey: agent.key, sourceName: agent.name }, () => runSkill(agent, viewer, formData));
}

async function runSkill(agent: Agent, viewer: Awaited<ReturnType<typeof getPortalViewer>>, formData: FormData): Promise<SelfServiceAgentState> {
  const agentId = agent.id;
  const startedAt = new Date();

  // Brand OS with its rules as they are right now (brand-rules.ts): a rule changed a second ago applies.
  const brandOS = await loadBrandForAgents(viewer.clientId);
  const common = { clientId: viewer.clientId, requestedByUserId: viewer.userId, client: viewer.client, brandOS };

  let result: { ok: true } | { ok: false; error: string };

  switch (agent.key) {
    case "brief_generator_agent": {
      const idea = String(formData.get("idea") ?? "").trim();
      const goal = String(formData.get("goal") ?? "").trim();
      if (!idea || !goal) return { error: "Describe what you want to make and what it should achieve." };
      result = await generateSelfServeBrief({ ...common, idea, goal });
      break;
    }
    case "linkedin_post_agent":
    case "landing_page_copy_agent":
    case "instagram_caption_agent":
    case "email_copy_agent": {
      const goal = String(formData.get("goal") ?? "").trim();
      const keyPoints = String(formData.get("keyPoints") ?? "").trim();
      if (!goal || !keyPoints) return { error: "Fill in the goal and key points first." };
      const nicheArgs = { ...common, goal, keyPoints };
      result =
        agent.key === "linkedin_post_agent"
          ? await generateLinkedInPost(nicheArgs)
          : agent.key === "landing_page_copy_agent"
            ? await generateLandingPageCopy(nicheArgs)
            : agent.key === "instagram_caption_agent"
              ? await generateInstagramCaption(nicheArgs)
              : await generateEmailCopy(nicheArgs);
      break;
    }
    case "ad_gen": {
      const format = String(formData.get("format") ?? "").trim();
      const idea = String(formData.get("idea") ?? "").trim();
      if (!format || !idea) return { error: "Describe the format and the idea first." };
      result = await generateSelfServeAdConcept({ ...common, format, idea });
      break;
    }
    case "image_gen_agent": {
      const idea = String(formData.get("idea") ?? "").trim();
      if (!idea) return { error: "Describe the image you want first." };
      result = await generateSelfServeImage({ ...common, idea });
      break;
    }
    default: {
      // A custom skill built for this client: its spec plus what they typed.
      if (agent.clientId !== viewer.clientId) return { error: "This skill doesn't have a form to run it yet." };
      const input = String(formData.get("input") ?? "").trim().slice(0, 4000);
      if (!input) return { error: "Tell the skill what to work on first." };
      result = await runCustomSkill({ ...common, agent, input });
      break;
    }
  }

  if (!result.ok) return { error: result.error };

  // Every finished run lands in the Output library.
  const run = await prisma.agentRun.findFirst({ where: { agentId, clientId: viewer.clientId, requestedByUserId: viewer.userId, status: "SUCCESS", createdAt: { gte: startedAt } }, orderBy: { createdAt: "desc" } });
  if (run) await saveSkillOutput(run.id);

  revalidatePath(`/skills/${agentId}`);
  revalidatePath("/skills");
  revalidatePath("/library");
  return { error: null };
}

// ─── Phase R: a run with versions (skill-run.ts, design 03) ────────────────────────────────────────────────

/** A skill the client may run themselves: a standard self-service skill, or their own custom skill. */
async function runnableSkill(viewer: Awaited<ReturnType<typeof getPortalViewer>>, agentId: string) {
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || agent.kind !== "SKILL") return null;
  if (agent.clientId ? agent.clientId !== viewer.clientId : agent.availability !== "self_service") return null;
  return agent;
}

export type RunVersionsState = { error?: string | null; topUp?: boolean };

export async function runSkillVersionsAction(_prev: RunVersionsState, formData: FormData): Promise<RunVersionsState> {
  const viewer = await getPortalViewer();
  const agent = await runnableSkill(viewer, String(formData.get("agentId") ?? ""));
  if (!agent) return { error: "This skill isn't one you can run yourself." };
  const say = String(formData.get("say") ?? "").trim().slice(0, 2000);
  if (!say) return { error: "Write what it should say first." };
  const projectId = String(formData.get("projectId") ?? "") || null;
  if (projectId && !(await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId }, select: { id: true } }))) return { error: "Pick one of your projects." };
  const settings: RunSettings = {
    format: String(formData.get("format") ?? "") || null,
    channel: String(formData.get("channel") ?? "") || null,
    product: String(formData.get("product") ?? "") || null,
    say,
    startFrom: String(formData.get("startFrom") ?? "blank"),
    versions: Math.max(1, Math.min(4, Number(formData.get("versions") ?? 1) || 1)),
    projectId,
  };
  const gate = await aiGate(viewer.clientId, "skill");
  if (!gate.ok) return { error: gate.error, topUp: gate.topUp };
  const r = await withAiCharge({ clientId: viewer.clientId, userId: viewer.userId, sourceType: "skill", sourceKey: agent.key, sourceName: agent.name, projectId: projectId ?? undefined }, () => runSkillBatch(agent, viewer, settings));
  revalidatePath(`/skills/${agent.id}`);
  revalidatePath("/skills");
  return { error: r.error };
}

/** Save a version to the Output library, make it again, or try its image again (charged only when it works). */
export async function versionAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const agent = await runnableSkill(viewer, String(formData.get("agentId") ?? ""));
  const runId = String(formData.get("runId") ?? "");
  const op = String(formData.get("op") ?? "");
  if (!agent || !runId) return;
  const run = await prisma.agentRun.findFirst({ where: { id: runId, agentId: agent.id, clientId: viewer.clientId, requestedByUserId: viewer.userId }, select: { id: true } });
  if (!run) return;
  if (op === "save") {
    await saveSkillOutput(run.id);
    revalidatePath("/library");
  } else if (op === "redo" || op === "image") {
    const gate = await aiGate(viewer.clientId, "skill");
    if (gate.ok) await withAiCharge({ clientId: viewer.clientId, userId: viewer.userId, sourceType: "skill", sourceKey: agent.key, sourceName: agent.name }, () => (op === "redo" ? redoVersion(agent, viewer, run.id) : retryImage(viewer, run.id)));
  }
  revalidatePath(`/skills/${agent.id}`);
}

export async function editVersionAction(_prev: RunVersionsState, formData: FormData): Promise<RunVersionsState> {
  const viewer = await getPortalViewer();
  const agent = await runnableSkill(viewer, String(formData.get("agentId") ?? ""));
  if (!agent) return { error: "This skill isn't one you can run yourself." };
  const field = (k: string) => (formData.has(k) ? String(formData.get(k) ?? "").trim().slice(0, 600) : undefined);
  const r = await withAiCharge({ clientId: viewer.clientId, userId: viewer.userId, sourceType: "skill", sourceKey: agent.key, sourceName: agent.name }, () => editVersion(viewer, String(formData.get("runId") ?? ""), { headline: field("headline"), body: field("body"), cta: field("cta") }));
  revalidatePath(`/skills/${agent.id}`);
  return { error: r.error };
}

export type PolishState = { ok?: string; projectId?: string; error?: string };

/**
 * "Ask Klingit to polish" a version: a small request linked to it, as a Draft on Ongoing projects for the client
 * to confirm, starting from ≈2 team credits (a placeholder; the estimate sets the price).
 */
export async function polishVersionAction(_prev: PolishState, formData: FormData): Promise<PolishState> {
  const viewer = await getPortalViewer();
  const agent = await runnableSkill(viewer, String(formData.get("agentId") ?? ""));
  const run = agent ? await prisma.agentRun.findFirst({ where: { id: String(formData.get("runId") ?? ""), agentId: agent.id, clientId: viewer.clientId, requestedByUserId: viewer.userId } }) : null;
  if (!agent || !run) return { error: "Pick a version first." };
  const output = (run.output ?? {}) as Record<string, unknown>;
  const letter = (run.input as { version?: string } | null)?.version ?? "";
  const saved = await saveSkillOutput(run.id);
  const projectId = await createKlingitRequest(viewer, {
    name: `Polish: ${agent.name} version ${letter}`.trim(),
    text: [`Polish this ${agent.name} version (${letter}) so it's ready to run. Keep the idea; make it perfect.`, "", toPlainText(agent.key, output)].join("\n"),
    event: `Polish requested for ${agent.name} version ${letter}${saved ? " (saved in the Output library)" : ""}`,
    send: false,
    teamCredits: POLISH_TEAM_CREDITS,
  });
  revalidatePath("/projects");
  return { ok: "Added to Ongoing projects as a draft. Confirm it there to send it to Klingit.", projectId };
}
