import { randomBytes } from "node:crypto";
import type { Agent, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { loadBrandForAgents } from "@/lib/brand-rules";
import { checkCopy, type CopyCheck } from "@/lib/rule-check";
import { attachGeneratedImage } from "@/lib/ai/agents/self-serve/attach-image";
import { generateSelfServeAdConcept } from "@/lib/ai/agents/self-serve/ad-concept-generator";
import { generateSelfServeImage } from "@/lib/ai/agents/self-serve/image-gen-agent";
import { generateSelfServeBrief } from "@/lib/ai/agents/self-serve/brief-generator";
import { generateSelfServeCarousel } from "@/lib/ai/agents/self-serve/carousel-builder";
import { generateEmailCopy, generateInstagramCaption, generateLandingPageCopy, generateLinkedInPost } from "@/lib/ai/agents/self-serve/niche-copy-agents";
import { runCustomSkill } from "@/lib/ai/agents/self-serve/custom-skill";
import { toPlainText } from "@/lib/skill-output-text";
import type { PortalViewer } from "@/lib/brief-intake";

/**
 * A skill run with versions (Phase R, design 03). One run makes 1–4 versions in parallel, each a different angle;
 * every version is an AgentRun tied to the others by `input.batchId`, and each goes through the one rule check
 * (checkCopy) with the run's channel and product. The caller charges it (withAiCharge, sourceType "skill"); the
 * batch's real AI credits are summed from the ledger afterwards.
 */

export const LETTERS = ["A", "B", "C", "D"] as const;
// Versions run in parallel and can't see each other, so each gets its own way in: different headlines, same brief.
const ANGLE: Record<string, string> = {
  A: "the most direct take: lead with the product name and the news",
  B: "a warmer take: lead with how it feels for the person using it",
  C: "a lighter take: lead with a short question or a playful line",
  D: "the most minimal take: lead with one or two words",
};

export type RunSettings = { format: string | null; channel: string | null; product: string | null; say: string; startFrom: string; versions: number; projectId: string | null };
type RunInput = { batchId: string; version: string; settings: RunSettings; startedAt: string; replacedBy?: string; batchCredits?: number };

/** What a version says, for the card and for the rule check. */
export function versionCopy(agentKey: string, output: Record<string, unknown>): { headline: string; body: string; cta: string; text: string } {
  const s = (v: unknown) => (typeof v === "string" ? v : "");
  if (agentKey === "ad_gen") return { headline: s(output.headline), body: s(output.bodyCopy), cta: s(output.callToAction), text: [output.headline, output.bodyCopy, output.callToAction, output.caption].map(s).filter(Boolean).join("\n") };
  if (agentKey === "carousel_builder") {
    const cards = (output.cards as { headline: string; body: string }[] | undefined) ?? [];
    return { headline: cards[0]?.headline ?? "", body: cards.length ? `${cards.length} cards` : "", cta: s(output.callToAction), text: [...cards.flatMap((c) => [c.headline, c.body]), output.callToAction, output.caption].map(s).filter(Boolean).join("\n") };
  }
  if (agentKey === "image_gen_agent") return { headline: "", body: s(output.concept), cta: "", text: "" };
  const text = toPlainText(agentKey, output);
  return { headline: text.split("\n").find(Boolean) ?? "", body: text.split("\n").filter(Boolean).slice(1, 3).join(" "), cta: "", text };
}

/** The line a skill works from: what to say, the product with its facts, where it starts from, and the angle. */
async function brief(clientId: string, settings: RunSettings, version: string) {
  const lines = [settings.say];
  if (settings.product) lines.push(`PRODUCT: ${settings.product} (use its facts and claims exactly as Brand OS has them; product rules apply).`);
  if (settings.startFrom === "top") {
    const top = await prisma.asset.findFirst({ where: { clientId, performanceCtr: { not: null } }, orderBy: { performanceCtr: "desc" }, select: { name: true, format: true, performanceCtr: true, tags: true } });
    const copy = Object.values(((top?.tags as { copy?: Record<string, string> } | null)?.copy ?? {})).filter(Boolean).slice(0, 2).join(" / ");
    if (top) lines.push(`START FROM our top performer: “${top.name}” (${top.format}, ${top.performanceCtr}% CTR)${copy ? `, which said: ${copy}` : ""}. Keep what made it work; don't copy it.`);
  } else if (settings.startFrom.startsWith("layout:")) {
    const t = await prisma.template.findFirst({ where: { id: settings.startFrom.slice(7), OR: [{ clientId }, { clientId: null }] }, select: { name: true, category: true } });
    if (t) lines.push(`START FROM the saved layout “${t.name}” (${t.category}).`);
  } else if (settings.startFrom.startsWith("asset:")) {
    const a = await prisma.asset.findFirst({ where: { id: settings.startFrom.slice(6), clientId }, select: { name: true, format: true, performanceCtr: true, tags: true } });
    const copy = Object.values(((a?.tags as { copy?: Record<string, string> } | null)?.copy ?? {})).filter(Boolean).slice(0, 3).join(" / ");
    if (a) lines.push(`MAKE MORE LIKE this delivered ${a.format} “${a.name}”${a.performanceCtr != null ? ` (${a.performanceCtr}% CTR)` : ""}${copy ? `, which said: ${copy}` : ""}. A new take, same feel.`);
  } else if (settings.startFrom.startsWith("like:")) {
    const o = await prisma.skillOutput.findFirst({ where: { id: settings.startFrom.slice(5), clientId }, select: { title: true, text: true } });
    if (o) lines.push(`MAKE MORE LIKE THIS earlier output: “${o.title}”${o.text ? `:\n${o.text.slice(0, 600)}` : ""}`);
  }
  lines.push(`VERSION ${version}: ${ANGLE[version] ?? "a different take"}.`);
  return lines.join("\n");
}

async function generate(agent: Agent, viewer: PortalViewer, settings: RunSettings, version: string) {
  const brandOS = await loadBrandForAgents(viewer.clientId);
  const common = { clientId: viewer.clientId, requestedByUserId: viewer.userId, client: viewer.client, brandOS };
  const idea = await brief(viewer.clientId, settings, version);
  const where = [settings.format, settings.channel].filter(Boolean).join(" for ");
  switch (agent.key) {
    case "ad_gen":
      return generateSelfServeAdConcept({ ...common, format: where || "Story 9:16 for Instagram", idea });
    case "carousel_builder":
      return generateSelfServeCarousel({ ...common, format: where || "Carousel 4:5 for Instagram", idea });
    case "image_gen_agent":
      return generateSelfServeImage({ ...common, idea: `${idea}\nASPECT: ${settings.format ?? "Square 1:1"}` });
    case "brief_generator_agent":
      return generateSelfServeBrief({ ...common, idea, goal: "Make it something Klingit can produce" });
    case "linkedin_post_agent":
    case "landing_page_copy_agent":
    case "instagram_caption_agent":
    case "email_copy_agent": {
      const args = { ...common, goal: `${settings.channel ?? agent.name}: ${settings.say.split(/[.\n]/)[0]}`, keyPoints: idea };
      return agent.key === "linkedin_post_agent" ? generateLinkedInPost(args) : agent.key === "landing_page_copy_agent" ? generateLandingPageCopy(args) : agent.key === "instagram_caption_agent" ? generateInstagramCaption(args) : generateEmailCopy(args);
    }
    default:
      return runCustomSkill({ ...common, agent, input: idea });
  }
}

/** Makes one version and tags its run; the rule check result goes on the run's output. */
async function makeVersion(agent: Agent, viewer: PortalViewer, settings: RunSettings, batchId: string, version: string, startedAt: string) {
  const r = await generate(agent, viewer, settings, version);
  if (!r.ok) return { ok: false as const, error: r.error };
  const output = r.data as Record<string, unknown>;
  const copy = versionCopy(agent.key, output);
  const check = copy.text ? await checkCopy(viewer.clientId, copy.text, { channel: settings.channel, product: settings.product, agentContext: { requestedByUserId: viewer.userId, projectId: settings.projectId ?? undefined } }) : null;
  const input: RunInput = { batchId, version, settings, startedAt };
  await prisma.agentRun.update({ where: { id: r.runId }, data: { input: input as unknown as Prisma.InputJsonValue, output: { ...output, check } as Prisma.InputJsonValue, projectId: settings.projectId } });
  return { ok: true as const, runId: r.runId };
}

/** The batch's real cost: every ledger row this skill charged this user since the batch started. */
async function recordBatchCredits(clientId: string, userId: string, agentKey: string, batchId: string, startedAt: string) {
  const rows = await prisma.aiCreditLedger.aggregate({ where: { clientId, userId, kind: "USAGE", sourceKey: agentKey, createdAt: { gte: new Date(startedAt) } }, _sum: { amount: true } });
  const credits = Math.round(-(rows._sum.amount ?? 0) * 10) / 10;
  const runs = (await recentRuns(clientId, userId)).filter((r) => (r.input as RunInput | null)?.batchId === batchId);
  for (const r of runs) await prisma.agentRun.update({ where: { id: r.id }, data: { input: { ...(r.input as object), batchCredits: credits } } });
}

export async function runSkillBatch(agent: Agent, viewer: PortalViewer, settings: RunSettings): Promise<{ error: string | null; batchId: string }> {
  const batchId = randomBytes(8).toString("hex");
  const startedAt = new Date().toISOString();
  const n = Math.max(1, Math.min(4, settings.versions));
  const results = await Promise.all(LETTERS.slice(0, n).map((v) => makeVersion(agent, viewer, settings, batchId, v, startedAt)));
  if (!results.some((r) => r.ok)) return { error: results.find((r) => !r.ok && "error" in r)?.error ?? "The skill couldn't run.", batchId };
  await recordBatchCredits(viewer.clientId, viewer.userId, agent.key, batchId, startedAt);
  return { error: null, batchId };
}

/** Redo one version: a fresh take with the same settings, in the same place (the old one is kept, out of view). */
export async function redoVersion(agent: Agent, viewer: PortalViewer, runId: string) {
  const old = await prisma.agentRun.findFirst({ where: { id: runId, clientId: viewer.clientId, requestedByUserId: viewer.userId } });
  const input = old?.input as RunInput | null;
  if (!old || !input?.batchId) return { error: "That version isn't there any more." };
  const r = await makeVersion(agent, viewer, input.settings, input.batchId, input.version, new Date().toISOString());
  if (!r.ok) return { error: r.error };
  await prisma.agentRun.update({ where: { id: old.id }, data: { input: { ...input, replacedBy: r.runId } as unknown as Prisma.InputJsonValue } });
  await recordBatchCredits(viewer.clientId, viewer.userId, agent.key, input.batchId, input.startedAt);
  return { error: null };
}

/** Edit a version's words, then check them again. */
export async function editVersion(viewer: PortalViewer, runId: string, fields: { headline?: string; body?: string; cta?: string }) {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, clientId: viewer.clientId, requestedByUserId: viewer.userId }, include: { agent: true } });
  const input = run?.input as RunInput | null;
  if (!run || !input?.batchId) return { error: "That version isn't there any more." };
  const output = { ...(run.output as Record<string, unknown>) };
  if (run.agent.key === "ad_gen") Object.assign(output, fields.headline != null && { headline: fields.headline }, fields.body != null && { bodyCopy: fields.body }, fields.cta != null && { callToAction: fields.cta });
  else if (run.agent.key === "carousel_builder" && fields.headline != null) output.cards = ((output.cards as { headline: string; body: string }[]) ?? []).map((c, i) => (i === 0 ? { ...c, headline: fields.headline! } : c));
  else if (fields.body != null) output.text = fields.body;
  const copy = versionCopy(run.agent.key, output);
  const check: CopyCheck | null = copy.text ? await checkCopy(viewer.clientId, copy.text, { channel: input.settings.channel, product: input.settings.product, agentContext: { requestedByUserId: viewer.userId } }) : null;
  await prisma.agentRun.update({ where: { id: run.id }, data: { output: { ...output, check, edited: true } as Prisma.InputJsonValue } });
  return { error: null };
}

/** "Try again" on a failed image: only the image is made again, and it's charged only when it works. */
export async function retryImage(viewer: PortalViewer, runId: string) {
  const run = await prisma.agentRun.findFirst({ where: { id: runId, clientId: viewer.clientId, requestedByUserId: viewer.userId } });
  const output = run?.output as (Record<string, unknown> & { imagePrompt?: string; aspectRatioSuggestion?: string }) | null;
  if (!run || !output?.imagePrompt) return { error: "That version has no image to make." };
  const rest = { ...output };
  delete rest.imageError;
  const r = await attachGeneratedImage({ ok: true, runId: run.id, data: { ...rest, imagePrompt: output.imagePrompt, aspectRatioSuggestion: output.aspectRatioSuggestion ?? "1:1" } });
  return { error: r.ok && "imageError" in (r.data as object) ? "The image still didn't come out. Try again later, or ask Klingit." : null };
}

export type BatchVersion = { runId: string; letter: string; output: Record<string, unknown>; check: CopyCheck | null; saved: boolean; imageError: string | null; image: string | null; copy: ReturnType<typeof versionCopy> };

/** This user's latest run of a skill, with its versions (replaced ones out of view). */
export async function loadLatestBatch(clientId: string, userId: string, agent: Agent) {
  const recent = await recentRuns(clientId, userId, agent.id);
  const batchId = recent.map((r) => (r.input as RunInput | null)?.batchId).find(Boolean);
  if (!batchId) return null;
  const runs = recent.filter((r) => (r.input as RunInput | null)?.batchId === batchId).reverse();
  const live = runs.filter((r) => !(r.input as RunInput).replacedBy && r.status === "SUCCESS");
  const saved = new Set((await prisma.skillOutput.findMany({ where: { agentRunId: { in: live.map((r) => r.id) } }, select: { agentRunId: true } })).map((s) => s.agentRunId));
  const first = runs[0].input as RunInput;
  const versions: BatchVersion[] = live
    .map((r) => {
      const output = (r.output ?? {}) as Record<string, unknown>;
      return { runId: r.id, letter: (r.input as RunInput).version, output, check: (output.check as CopyCheck | null) ?? null, saved: saved.has(r.id), imageError: typeof output.imageError === "string" ? output.imageError : null, image: typeof output.imageDataUri === "string" ? output.imageDataUri : null, copy: versionCopy(agent.key, output) };
    })
    .sort((a, b) => a.letter.localeCompare(b.letter));
  const credits = Math.max(...runs.map((r) => (r.input as RunInput).batchCredits ?? 0));
  return { batchId, settings: first.settings, startedAt: new Date(first.startedAt), credits, versions };
}

/** A user's recent runs of a skill (or of all skills), newest first; batches are found among these. */
function recentRuns(clientId: string, userId: string, agentId?: string) {
  return prisma.agentRun.findMany({ where: { clientId, requestedByUserId: userId, ...(agentId ? { agentId } : {}) }, orderBy: { createdAt: "desc" }, take: 40 });
}
