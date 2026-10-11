"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import type { Agent } from "@/generated/prisma";
import { aiGate } from "@/lib/ai-credits";
import { withAiCharge } from "@/lib/ai-context";
import { generateSelfServeBrief } from "@/lib/ai/agents/self-serve/brief-generator";
import { generateSelfServeAdConcept } from "@/lib/ai/agents/self-serve/ad-concept-generator";
import { generateSelfServeImage } from "@/lib/ai/agents/self-serve/image-gen-agent";
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

  const brandOS = await prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } });
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
    default:
      return { error: "This skill doesn't have a form to run it yet." };
  }

  if (!result.ok) return { error: result.error };

  revalidatePath(`/skills/${agentId}`);
  revalidatePath("/skills");
  return { error: null };
}
