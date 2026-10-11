import { prisma } from "@/lib/prisma";
import { writeUploadAt } from "@/lib/uploads";
import { toPlainText } from "@/lib/skill-output-text";

/** What each skill makes, for the Output library's Format and Channel filters. */
const OUTPUT_KIND: Record<string, { format: string; channel: string | null }> = {
  ad_gen: { format: "Ad", channel: "Meta" },
  image_gen_agent: { format: "Image", channel: null },
  instagram_caption_agent: { format: "Caption", channel: "Instagram" },
  linkedin_post_agent: { format: "Post", channel: "LinkedIn" },
  email_copy_agent: { format: "Email", channel: "Email" },
  landing_page_copy_agent: { format: "Web copy", channel: "Web" },
  brief_generator_agent: { format: "Brief", channel: null },
};

/**
 * A successful skill run lands in the Output library: its text, its title, and a generated image as a file. Runs
 * without output (failed) are skipped. Returns the SkillOutput, or null.
 */
export async function saveSkillOutput(agentRunId: string) {
  const run = await prisma.agentRun.findUnique({ where: { id: agentRunId }, include: { agent: true } });
  if (!run || run.status !== "SUCCESS" || !run.clientId || !run.output || typeof run.output !== "object") return null;
  const existing = await prisma.skillOutput.findFirst({ where: { agentRunId } });
  if (existing) return existing;
  const data = run.output as Record<string, unknown>;
  // A run with versions (skill-run.ts) knows its own format and channel.
  const settings = (run.input as { settings?: { format?: string | null; channel?: string | null } } | null)?.settings;
  const base = OUTPUT_KIND[run.agent.key] ?? { format: run.agent.clientId ? "Custom" : "Output", channel: null };
  const kind = { format: settings?.format ?? base.format, channel: settings?.channel ?? base.channel };
  const title = String(data.title ?? data.headline ?? data.concept ?? data.hook ?? (Array.isArray(data.subjectLines) ? data.subjectLines[0] : null) ?? run.decision ?? run.agent.name).slice(0, 140);
  let storageKey: string | null = null;
  let mimeType: string | null = null;
  const image = typeof data.imageDataUri === "string" ? data.imageDataUri.match(/^data:(image\/[a-z+]+);base64,(.+)$/) : null;
  if (image) {
    mimeType = image[1];
    storageKey = (await writeUploadAt(`skill-outputs/${run.clientId}/${run.id}.${mimeType.split("/")[1].replace("jpeg", "jpg")}`, Buffer.from(image[2], "base64"))).storageKey;
  }
  return prisma.skillOutput.create({
    data: { clientId: run.clientId, agentRunId: run.id, agentId: run.agentId, title, format: kind.format, channel: kind.channel, text: toPlainText(run.agent.key, data) || null, storageKey, mimeType, createdByUserId: run.requestedByUserId, createdAt: run.createdAt },
  });
}
