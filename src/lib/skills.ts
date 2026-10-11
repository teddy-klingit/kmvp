import { prisma } from "@/lib/prisma";
import { agentBuildOf, type AgentBuild } from "@/lib/agent-build";
import { monthPeriod } from "@/lib/ai-credits";
import { jsonArray } from "@/lib/utils";

/**
 * Skills (nav v3): what a client can run (standard skills and their own custom skills), what Klingit is building
 * for them, the built-in assistants, and templates. Usage numbers come from the AI-credit ledger.
 */

export const SKILL_CATEGORIES = ["Copy", "Visual", "Social", "Briefs"] as const;
export type SkillCategory = (typeof SKILL_CATEGORIES)[number];

/** The built-in assistants (they work inside Brief, Insights and Home and use AI credits per answer). */
export const BUILT_IN_ASSISTANTS = [
  { key: "brief_agent", name: "Brief assistant", summary: "Asks only what Brand OS doesn't know" },
  { key: "ask_your_data", name: "Ask your data", summary: "Questions about your Insights" },
  { key: "market_intel_agent", name: "Market ideas", summary: "Weekly ideas from trends and competitors" },
  { key: "performance_agent", name: "Performance insights", summary: "Explains what changed and why" },
] as const;

/** Klingit recommends: custom skills worth building, with why. Shown until the client has asked for them. */
export const RECOMMENDED_SKILLS = [
  { name: "Ingredient explainer", reason: "Based on your range", summary: "Turns an INCI list into short, honest product copy in your voice." },
  { name: "UGC brief skill", reason: "New workflow", summary: "Creator briefs with your do's and don'ts and disclosure rules." },
  { name: "Seasonal content planner", reason: "Calendar", summary: "A month of post ideas from your calendar and what performed." },
] as const;

export type SkillAvailability = "self_service" | "klingit_run" | "custom";
export type SkillGoal = "make_ad" | "write_copy" | "plan_brief";
export const SKILL_GOALS: { goal: SkillGoal; title: string; sub: string }[] = [
  { goal: "make_ad", title: "Make an ad", sub: "Finished visuals with your brand applied" },
  { goal: "write_copy", title: "Write copy", sub: "In your voice, checked against your rules" },
  { goal: "plan_brief", title: "Plan & brief", sub: "Turn an idea into something Klingit can make" },
];
export const AVAILABILITY_LABEL: Record<SkillAvailability, string> = { self_service: "Self-service", klingit_run: "Run by Klingit", custom: "Custom" };

/** A card's example: the client's own output (image or text), else a staff-picked one. */
export type SkillExample = { title: string; image: string | null; text: string | null; color: string };

export type SkillRow = {
  id: string;
  key: string;
  name: string;
  category: string | null;
  summary: string;
  custom: boolean;
  live: boolean;
  availability: SkillAvailability;
  goal: SkillGoal;
  aiPerRun: number | null;
  teamCredits: number | null;
  examples: SkillExample[];
  runsThisMonth: number;
  aiThisMonth: number;
  lastRunAt: Date | null;
};

/**
 * Every skill this client can see, labelled (Phase R): the standard self-service ones, the ones Klingit runs for
 * them, and their own custom skills, with this month's use and up to 3 examples (their own outputs first).
 */
export async function listSkills(clientId: string, now = new Date()): Promise<SkillRow[]> {
  const { start, end } = monthPeriod(now);
  const [agents, usage, last, outputs] = await Promise.all([
    prisma.agent.findMany({ where: { kind: "SKILL", OR: [{ clientId: null, availability: { in: ["self_service", "klingit_run"] } }, { clientId }] }, orderBy: { name: "asc" } }),
    prisma.aiCreditLedger.findMany({ where: { clientId, kind: "USAGE", sourceType: "skill", createdAt: { gte: start, lt: end } }, select: { id: true, sourceKey: true, amount: true, agentRunId: true } }),
    prisma.aiCreditLedger.groupBy({ by: ["sourceKey"], where: { clientId, kind: "USAGE", sourceType: "skill" }, _max: { createdAt: true } }),
    prisma.skillOutput.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, agentId: true, title: true, text: true, storageKey: true, mimeType: true } }),
  ]);
  const TINTS = ["#E4ECEE", "#F6CDB8", "#F6E7B8", "#F7E6F7", "#FBF6F0"];
  return agents
    .filter((a) => a.clientId || a.status !== "DISABLED")
    .map((a) => {
      const rows = usage.filter((u) => u.sourceKey === a.key);
      return {
        id: a.id,
        key: a.key,
        name: a.name,
        category: a.skillCategory,
        summary: a.summary ?? a.description,
        custom: Boolean(a.clientId),
        live: a.status === "LIVE",
        availability: (a.clientId ? "custom" : (a.availability ?? "self_service")) as SkillAvailability,
        goal: (a.goal ?? "write_copy") as SkillGoal,
        aiPerRun: a.aiCreditsPerRun,
        teamCredits: a.teamCreditsEstimate,
        examples: [
          ...outputs.filter((o) => o.agentId === a.id).slice(0, 3).map((o, i): SkillExample => ({ title: o.title, image: o.storageKey && o.mimeType?.startsWith("image/") ? `/api/skill-outputs/${o.id}/file` : null, text: o.text, color: TINTS[i % TINTS.length] })),
          ...jsonArray<{ title: string; text?: string; color?: string }>(a.examples).map((e, i): SkillExample => ({ title: e.title, image: null, text: e.text ?? null, color: e.color ?? TINTS[(i + 1) % TINTS.length] })),
        ].slice(0, 3),
        runsThisMonth: new Set(rows.map((r) => r.agentRunId ?? r.id)).size,
        aiThisMonth: Math.round(-rows.reduce((s, r) => s + r.amount, 0)),
        lastRunAt: last.find((l) => l.sourceKey === a.key)?._max.createdAt ?? null,
      };
    })
    .sort((a, b) => Number(a.custom) - Number(b.custom) || a.name.localeCompare(b.name));
}

export type SkillBuild = {
  projectId: string;
  name: string;
  summary: string;
  build: AgentBuild;
  team: string[];
  /** Klingit's latest question, when it's waiting on the client. */
  question: string | null;
};

/** Custom skills Klingit is building for this client (agent-build projects not live yet). */
export async function listSkillBuilds(clientId: string): Promise<SkillBuild[]> {
  const projects = await prisma.project.findMany({
    where: { clientId, agentBuild: true, status: { notIn: ["ARCHIVED", "DELIVERED"] } },
    include: {
      brief: { select: { agentDrafts: true, rawIntake: true } },
      team: { include: { members: { include: { staffMember: { include: { user: { select: { name: true } } } } } } } },
      comments: { where: { kind: "MESSAGE", archivedAt: null }, orderBy: { createdAt: "desc" }, take: 1, select: { body: true, authorUserId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return projects.flatMap((p) => {
    const build = agentBuildOf(p.brief);
    if (!build || build.step === "Live") return [];
    const last = p.comments[0];
    return [
      {
        projectId: p.id,
        name: p.name,
        summary: build.spec.whatItDoes,
        build,
        team: (p.team?.members ?? []).map((m) => m.staffMember.user.name),
        // The last word in the build conversation is Klingit's: they're waiting on an answer.
        question: last?.authorUserId ? last.body : null,
      },
    ];
  });
}

/** Which skill a template runs with: by name first (a carousel is an ad), then by its category. */
const TEMPLATE_SKILL_BY_CATEGORY: Record<string, string> = { Display: "ad_gen", Social: "image_gen_agent", Copy: "email_copy_agent", Web: "landing_page_copy_agent", Briefs: "brief_generator_agent" };
export function templateSkillKey(t: { name: string; category: string }) {
  if (/carousel|story ad|\bad\b|banner/i.test(t.name)) return "ad_gen";
  if (/brief/i.test(t.name)) return "brief_generator_agent";
  if (/email|newsletter/i.test(t.name)) return "email_copy_agent";
  if (/hero|landing|page/i.test(t.name)) return "landing_page_copy_agent";
  return TEMPLATE_SKILL_BY_CATEGORY[t.category] ?? "ad_gen";
}

/** A finished build becomes the client's own skill (kind SKILL with their clientId), keyed by its build project. */
export async function publishCustomSkill(clientId: string, projectId: string, name: string, build: AgentBuild) {
  const key = `custom_${projectId}`;
  const description = [`What it does: ${build.spec.whatItDoes}`, `What it uses: ${build.spec.whatItUses}`, `What you get: ${build.spec.whatYouGet}`, `Runs: ${build.spec.runs}`].join("\n");
  return prisma.agent.upsert({
    where: { key },
    update: { name, summary: build.spec.whatItDoes, description, aiCreditsPerRun: build.perRunCredits, status: "LIVE" },
    create: { key, name, kind: "SKILL", clientId, category: "PRODUCTION", summary: build.spec.whatItDoes, description, aiCreditsPerRun: build.perRunCredits, status: "LIVE", availability: "custom", goal: "write_copy" },
  });
}
