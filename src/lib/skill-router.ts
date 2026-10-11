import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { runAgentTask } from "@/lib/ai/run-agent";
import { listSkills, type SkillRow } from "@/lib/skills";
import { brandProducts, formFor } from "@/lib/skill-forms";

/**
 * "What do you want to make?" (Phase R, design 02): one cheap model call maps a request in plain words to the best
 * skill (and, optionally, a second one to run on each result) with its settings. The caller charges it as an
 * assistant use (withAiCharge). Nothing here runs a skill: "Set it up" opens the run page pre-filled.
 */

const schema = z.object({
  skillKey: z.string().describe("The key of the best skill from the list, or 'none' if none fits"),
  thenKey: z.string().describe("Optional: the key of a second skill to run on each result (e.g. a caption for each ad), or ''"),
  format: z.string().describe("One of the skill's formats, exactly as listed, or ''"),
  channel: z.string().describe("One of the skill's channels, exactly as listed, or ''"),
  product: z.string().describe("One of the brand's products, exactly as listed, or ''"),
  versions: z.number().int().min(1).max(4).describe("How many versions they asked for (default 3)"),
  say: z.string().describe("What the result should say, in the client's words, without the format/product/count"),
});

export type SkillFit = {
  skill: SkillRow;
  then: SkillRow | null;
  settings: { format: string | null; channel: string | null; product: string | null; versions: number; say: string };
  /** ≈ AI credits for the whole thing (the skill × versions, plus the second skill per version). */
  aiCredits: number | null;
  href: string;
};

export async function findSkill(clientId: string, request: string, userId?: string): Promise<{ fit: SkillFit | null; error: string | null }> {
  const text = request.trim().slice(0, 600);
  if (!text) return { fit: null, error: "Write what you want to make first." };
  const [skills, brandOS] = await Promise.all([listSkills(clientId), prisma.brandOS.findUnique({ where: { clientId }, select: { keyProducts: true } })]);
  const usable = skills.filter((s) => s.live);
  const products = brandProducts(brandOS?.keyProducts).map((p) => p.name);
  const r = await runAgentTask({
    agentKey: "skill_router",
    clientId,
    requestedByUserId: userId,
    system: "You pick the best tool for a marketing request. Prefer a self-service skill; pick a 'klingit_run' skill only when the client clearly needs people (editing film, translation by a native writer, strategy). Use settings exactly as listed.",
    prompt: [
      "SKILLS (key · name · label · what it does · formats · channels):",
      ...usable.map((s) => `${s.key} · ${s.name} · ${s.availability} · ${s.summary} · ${(formFor(s.key).formats ?? []).join("/") || "-"} · ${(formFor(s.key).channels ?? []).join("/") || "-"}`),
      `PRODUCTS: ${products.join(", ") || "none"}`,
      "",
      `REQUEST: ${text}`,
    ].join("\n"),
    schema,
    summarize: (d) => `Best fit: ${d.skillKey}${d.thenKey ? ` then ${d.thenKey}` : ""}`,
  });
  if (!r.ok) return { fit: null, error: "Couldn't look that up right now. Try again, or pick a skill below." };
  const skill = usable.find((s) => s.key === r.data.skillKey);
  if (!skill) return { fit: null, error: null };
  const then = r.data.thenKey ? (usable.find((s) => s.key === r.data.thenKey && s.availability !== "klingit_run") ?? null) : null;
  const form = formFor(skill.key);
  const pick = (v: string, list?: string[]) => (list?.find((x) => x.toLowerCase() === v.trim().toLowerCase()) ?? null);
  const settings = {
    format: pick(r.data.format, form.formats),
    channel: pick(r.data.channel, form.channels),
    product: pick(r.data.product, products),
    versions: form.versions ? r.data.versions : 1,
    say: r.data.say.trim() || text,
  };
  const aiCredits = skill.availability === "klingit_run" || skill.aiPerRun == null ? null : Math.round(skill.aiPerRun * settings.versions + (then?.aiPerRun ?? 0) * settings.versions);
  const q = new URLSearchParams(Object.entries({ format: settings.format, channel: settings.channel, product: settings.product, versions: String(settings.versions), say: settings.say, then: then?.id ?? null }).filter((e): e is [string, string] => Boolean(e[1])));
  return { fit: { skill, then, settings, aiCredits, href: `/skills/${skill.id}?${q}` }, error: null };
}
