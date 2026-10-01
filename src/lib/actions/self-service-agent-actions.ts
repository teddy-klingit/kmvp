"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { generateSelfServeBrief } from "@/lib/ai/agents/self-serve/brief-generator";
import { generateSelfServeAdConcept } from "@/lib/ai/agents/self-serve/ad-concept-generator";
import { generateSelfServeImage } from "@/lib/ai/agents/self-serve/image-gen-agent";
import {
  generateLinkedInPost,
  generateLandingPageCopy,
  generateInstagramCaption,
  generateEmailCopy,
} from "@/lib/ai/agents/self-serve/niche-copy-agents";

export type SelfServiceAgentState = { error?: string | null };

export async function runSelfServiceAgentAction(
  _prev: SelfServiceAgentState,
  formData: FormData
): Promise<SelfServiceAgentState> {
  const viewer = await getPortalViewer();
  const agentId = String(formData.get("agentId") ?? "");

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) return { error: "Agent not found." };
  if (!agent.selfService) return { error: "This agent isn't available for self-service." };

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
      return { error: "This agent doesn't have a self-service form yet." };
  }

  if (!result.ok) return { error: result.error };

  revalidatePath(`/assets/agents-templates/agent/${agentId}`);
  revalidatePath("/assets/agents-templates");
  return { error: null };
}
