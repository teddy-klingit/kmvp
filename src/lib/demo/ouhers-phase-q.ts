import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { monthPeriod, planFor } from "@/lib/ai-credits";

/**
 * Phase Q on top of the ouhers pack (nav v3, skills, AI credits, usage, connections): the pack was written for a
 * Scale plan with "agents", so this layer turns it into what the designs show. Growth plan (40 team credits, 3
 * slots, 1,500 AI credits), two more members, two custom skill builds and three custom skills, AI credit use for
 * the last three months, October's team credits by project and person, skill outputs, video views, connection
 * states and billing. All demo: everything here belongs to the ouhers client and goes with it on a reseed.
 */

const DAY = 86400000;

/** Text-level renames in every pack file: the pack's custom agent is now the Ingredient explainer skill build. */
export function phaseQText(json: string) {
  return json.replaceAll("Seasonal content agent", "Ingredient explainer").replaceAll("Seasonal agent", "Ingredient explainer");
}

type Account = {
  plan: { monthlyCredits: number; creditsUsedByMonth: Record<string, number> };
  clientUsers: { id: string; name: string; email: string; role: string; permission: string }[];
};
type Agents = { yourAgents: { name: string; status: string; meta: string; what: string }[] };
type Project = Record<string, unknown> & { id: string; title: string; clientStage: string; credits: Record<string, unknown> };

export const PHASE_Q_PLAN = { tier: "GROWTH" as const, teamCredits: 40 };

/** Team credits used per month before this one (Growth, 40 a month). This month is written per project below. */
const TEAM_HISTORY = [38, 26, 35, 40, 31];

/** The custom skills the client already has (Skills → Your skills). */
const CUSTOM_SKILLS = [
  { slug: "tone_checker", name: "ouhers tone checker", category: "Copy", status: "LIVE" as const, perRun: 2, summary: "Checks any copy against your voice rules" },
  { slug: "market_recap", name: "Market recap", category: "Briefs", status: "LIVE" as const, perRun: 12, summary: "Weekly summary of competitor launches" },
  { slug: "product_feed_captions", name: "Product feed captions", category: "Social", status: "DISABLED" as const, perRun: 3, summary: "Captions for every new SKU in the feed" },
];
export const customSkillKey = (slug: string) => `demo_ouhers_${slug}`;

/** Edits the parsed pack in memory before it's seeded. */
export function phaseQPack(account: Account, agents: Agents, projects: Project[]) {
  const first = Object.keys(account.plan.creditsUsedByMonth).sort().pop()!; // the pack's "this month"
  const [y, m] = first.split("-").map(Number);
  const months = TEAM_HISTORY.map((_, i) => new Date(Date.UTC(y, m - 1 - (TEAM_HISTORY.length - i), 1)).toISOString().slice(0, 7));
  account.plan.monthlyCredits = PHASE_Q_PLAN.teamCredits;
  account.plan.creditsUsedByMonth = Object.fromEntries(months.map((k, i) => [k, TEAM_HISTORY[i]]));
  account.clientUsers.push(
    { id: "ou-erik", name: "Erik Karlsson", email: "erik@ouhers.demo", role: "Performance marketer", permission: "editor" },
    { id: "ou-sofia", name: "Sofia Berg", email: "sofia@ouhers.demo", role: "Content producer", permission: "editor" }
  );
  // Custom skills are created by seedPhaseQ, not as pack "agents".
  agents.yourAgents = [];

  // A healthy Growth month (designs 01/08): 22 used · 4 held · 14 left of 40. The estimate waiting on the client
  // is a 4-credit concept round for the retail display, not the whole 27-credit job.
  const retail = projects.find((p) => p.id === "p09-retail-display") as (Project & { estimate?: { lines: unknown[]; total: number } }) | undefined;
  if (retail?.estimate) {
    retail.estimate = { ...retail.estimate, lines: [{ deliverable: "Retail display, concept round (2 directions)", credits: 4 }], total: 4 };
    retail.credits = { ...retail.credits, estimated: [4, 4] };
  }

  // Output library (design 07): most delivered work inside the default 90 days, whenever the seed runs.
  const summer = projects.findIndex((p) => p.id === "p02-summer-sunday");
  if (summer >= 0) projects[summer] = shiftDates(projects[summer], SUMMER_SHIFT_DAYS);

  const build = projects.find((p) => p.id === "p11-agent-seasonal");
  if (build) {
    build.title = "Ingredient explainer";
    build.spec = {
      whatItDoes: "INCI list → short, honest product copy in your voice.",
      whatItUses: "Brand OS (voice, words we use and avoid), the product range and its INCI lists.",
      whatYouGet: "Three lengths of product copy per product, with every claim marked when it needs a source.",
      runs: "On demand, from Skills.",
    };
    build.testOutput = { title: "cloud cream · product copy", quality: 82, text: "Soft, whipped and fragrance-free. Squalane and ceramides keep skin comfortable all day; nothing you need to think twice about." };
    build.conversation = [
      { author: "kl-teddy", at: "2026-10-01T10:00:00+02:00", text: "Spec is locked. Should it flag claims that need a source (like 'clinically proven')?" },
      { author: "ou-maja", at: "2026-10-01T10:30:00+02:00", text: "Yes, flag them. We never print those without one." },
    ];
  }
  projects.push({
    id: "p13-skill-ugc-brief",
    kind: "agent_build",
    title: "UGC brief skill",
    clientStage: "active",
    internalStage: "scoping",
    type: "Custom agent",
    createdAt: "2026-10-03",
    credits: { buildCost: 16, perRunEstimate: 6 },
    team: ["kl-teddy"],
    stages: [
      { name: "Request", date: "2026-10-03", done: true },
      { name: "Scoping", date: "now" },
    ],
    spec: {
      whatItDoes: "Creator briefs with your rules and disclosure.",
      whatItUses: "Brand OS, your creator do's and don'ts, the disclosure rules per market.",
      whatYouGet: "A one-page creator brief per product and creator, ready to send.",
      runs: "On demand, from Skills.",
    },
    log: [{ at: "2026-10-03", text: "Requested from Klingit recommends" }],
    conversation: [
      { author: "ou-maja", at: "2026-10-03T09:00:00+02:00", text: "We brief 3–5 creators a month. A skill that writes the brief with our rules would save Elin a day each time." },
      { author: "kl-teddy", at: "2026-10-05T14:00:00+02:00", text: "Should it include usage-rights wording?" },
    ],
  });
}

/** Every date in a pack project moved by `days` (YYYY-MM-DD and full ISO strings), so its story stays in order. */
function shiftDates<T>(value: T, days: number): T {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
    const d = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
    if (Number.isNaN(d.getTime())) return value;
    const moved = new Date(d.getTime() + days * DAY);
    return (value.length === 10 ? moved.toISOString().slice(0, 10) : value.replace(/^\d{4}-\d{2}-\d{2}/, moved.toISOString().slice(0, 10))) as T;
  }
  if (Array.isArray(value)) return value.map((v) => shiftDates(v, days)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shiftDates(v, days)])) as T;
  return value;
}

/** The Summer campaign is moved this many days later, so it sits ~70 days before the seed date (inside the Output library's default 90 days). */
const SUMMER_SHIFT_DAYS = 34;

// A small seeded random generator, so every reseed writes the same numbers.
function random(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Source = { type: "skill" | "assistant"; key: string; name: string; credits: number; weight: number; format?: string; projectPackIds?: string[] };
const SOURCES: Source[] = [
  { type: "skill", key: "ad_gen", name: "Ad gen", credits: 25, weight: 3, format: "Story 9:16", projectPackIds: ["p05-holiday-giftset", "p06-dewdrop-creators"] },
  { type: "skill", key: "image_gen_agent", name: "Image gen", credits: 20, weight: 1.5, format: "Image" },
  { type: "skill", key: "instagram_caption_agent", name: "Instagram caption", credits: 4, weight: 3, format: "Caption" },
  { type: "skill", key: customSkillKey("market_recap"), name: "Market recap", credits: 12, weight: 0.8 },
  { type: "skill", key: customSkillKey("tone_checker"), name: "ouhers tone checker", credits: 2, weight: 3, format: "Copy" },
  { type: "skill", key: "email_copy_agent", name: "Email copy", credits: 6, weight: 0.6, format: "Email" },
  { type: "assistant", key: "brief_agent", name: "Brief assistant", credits: 4.2, weight: 4 },
  { type: "assistant", key: "ask_your_data", name: "Ask your data", credits: 2.3, weight: 4 },
  { type: "assistant", key: "market_intel_agent", name: "Market ideas", credits: 6, weight: 0.7 },
  { type: "assistant", key: "performance_agent", name: "Performance insights", credits: 5, weight: 0.7 },
];
/** AI credits used per day this month (the shape of the Usage chart), and the totals of the two months before. */
const THIS_MONTH_DAYS = [62, 95, 70, 38, 33, 118, 140, 96, 128, 106, 84, 91, 77, 99, 88];
const EARLIER_MONTHS = [640, 1320];

export async function seedPhaseQ(ctx: {
  clientId: string;
  now: Date;
  userId: (packUserId: string) => string;
  projectId: (packProjectId: string) => string;
  say: (s: string) => void;
}) {
  const { clientId, now } = ctx;
  const rnd = random(20261011);
  const people = [
    { id: ctx.userId("ou-maja"), weight: 0.45 },
    { id: ctx.userId("ou-erik"), weight: 0.35 },
    { id: ctx.userId("ou-sofia"), weight: 0.2 },
  ];
  const pick = <T extends { weight: number }>(xs: T[]) => {
    let r = rnd() * xs.reduce((a, x) => a + x.weight, 0);
    for (const x of xs) if ((r -= x.weight) <= 0) return x;
    return xs[xs.length - 1];
  };

  // ─── Plan and the custom skills ─────────────────────────────────────────
  await prisma.client.update({ where: { id: clientId }, data: { planTier: PHASE_Q_PLAN.tier, monthlyCreditAllowance: PHASE_Q_PLAN.teamCredits, cardBrand: "Visa", cardLast4: "4242", cardIsDemo: true } });
  // Earlier seeds made these as global "agents" (no client); the custom skills now belong to ouhers.
  const oldKeys = (await prisma.agent.findMany({ where: { key: { startsWith: "demo_ouhers_" } }, select: { id: true } })).map((a) => a.id);
  await prisma.agentRun.deleteMany({ where: { agentId: { in: oldKeys } } });
  await prisma.agent.deleteMany({ where: { id: { in: oldKeys } } });
  const skillIds = new Map<string, string>();
  for (const s of CUSTOM_SKILLS) {
    const a = await prisma.agent.create({ data: { key: customSkillKey(s.slug), name: s.name, kind: "SKILL", clientId, category: "PRODUCTION", skillCategory: s.category, summary: s.summary, description: `${s.summary} (demo)`, aiCreditsPerRun: s.perRun, status: s.status, createdAt: new Date(now.getTime() - 60 * DAY) } });
    skillIds.set(a.key, a.id);
  }
  for (const k of ["ad_gen", "image_gen_agent", "instagram_caption_agent", "email_copy_agent"]) {
    const a = await prisma.agent.findUnique({ where: { key: k }, select: { id: true } });
    if (a) skillIds.set(k, a.id);
  }

  // ─── AI credits: the allowance and use for this month and the two before ─
  const plan = await planFor(PHASE_Q_PLAN.tier);
  const periods = [2, 1, 0].map((back) => monthPeriod(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 15))));
  const rows: Prisma.AiCreditLedgerCreateManyInput[] = [];
  for (const [i, p] of periods.entries()) {
    await prisma.clientPlan.create({ data: { clientId, tier: PHASE_Q_PLAN.tier, periodStart: p.start, periodEnd: p.end, createdAt: p.start } });
    rows.push({ clientId, kind: "ALLOWANCE", amount: plan.monthlyAiCredits, note: `${plan.name} plan · ${p.key} (demo)`, createdAt: p.start });
    const days = Math.round((p.end.getTime() - p.start.getTime()) / DAY);
    const thisMonth = i === periods.length - 1;
    const today = thisMonth ? Math.floor((now.getTime() - p.start.getTime()) / DAY) + 1 : days;
    const perDay = thisMonth
      ? Array.from({ length: today }, (_, d) => THIS_MONTH_DAYS[d % THIS_MONTH_DAYS.length])
      : Array.from({ length: days }, () => (EARLIER_MONTHS[i] / days) * (0.4 + rnd() * 1.2));
    for (const [d, target] of perDay.entries()) {
      let left = target;
      let n = 0;
      while (left > 1) {
        const s = pick(SOURCES);
        if (s.credits > left + 3) {
          if (++n > 20) break;
          continue;
        }
        left -= s.credits;
        // Today: only before the seed's "now".
        const hour = thisMonth && d === today - 1 ? 7 + rnd() * 2.5 : 8 + rnd() * 9;
        const scheduled = s.key === "performance_agent" || s.key === customSkillKey("market_recap");
        const project = s.projectPackIds && rnd() < 0.6 ? ctx.projectId(s.projectPackIds[Math.floor(rnd() * s.projectPackIds.length)]) : null;
        rows.push({
          clientId,
          userId: scheduled && rnd() < 0.5 ? null : pick(people).id,
          kind: "USAGE",
          fundedBy: "allowance",
          sourceType: s.type,
          sourceKey: s.key,
          sourceName: s.name,
          projectId: project,
          format: s.format ?? null,
          amount: -s.credits,
          tokensIn: Math.round(s.credits * 600),
          tokensOut: Math.round(s.credits * 80),
          model: "claude-sonnet-5-5",
          createdAt: new Date(p.start.getTime() + d * DAY + hour * 3600000),
        });
      }
    }
  }
  // The paused skill ran last month until it was paused on the 12th.
  for (const d of [3, 7, 11]) {
    rows.push({ clientId, userId: ctx.userId("ou-sofia"), kind: "USAGE", fundedBy: "allowance", sourceType: "skill", sourceKey: customSkillKey("product_feed_captions"), sourceName: "Product feed captions", format: "Caption", amount: -3, tokensIn: 1800, tokensOut: 240, model: "claude-sonnet-5-5", createdAt: new Date(periods[1].start.getTime() + d * DAY + 11 * 3600000) });
  }
  await prisma.aiCreditLedger.createMany({ data: rows });
  const used = rows.filter((r) => r.kind === "USAGE" && new Date(r.createdAt!) >= periods[2].start).reduce((a, r) => a - r.amount, 0);
  ctx.say(`Phase Q · Growth plan · ${rows.length} AI credit rows · ${Math.round(used)} AI credits used this month (demo)`);

  // ─── Team credits this month, per project, person and format ────────────
  const start = periods[2].start;
  const team: [string, string, string, number][] = [
    ["p05-holiday-giftset", "ou-maja", "Feed 4:5", 10],
    ["p06-dewdrop-creators", "ou-erik", "Story 9:16", 6],
    ["p07-website-pdp", "ou-sofia", "Product page", 2],
    ["p11-agent-seasonal", "ou-maja", "Skill build", 4],
  ];
  let balance = PHASE_Q_PLAN.teamCredits;
  for (const [i, [pack, who, format, amount]] of team.entries()) {
    balance -= amount;
    await prisma.creditLedgerEntry.create({ data: { clientId, projectId: ctx.projectId(pack), userId: ctx.userId(who), format, type: "CONSUMPTION", amount: -amount, balanceAfter: balance, note: "Approved estimate lines (demo)", createdAt: new Date(Math.min(now.getTime() - DAY, start.getTime() + (i + 1) * 2 * DAY)) } });
  }
  await prisma.creditLedgerEntry.create({ data: { clientId, type: "ALLOWANCE", amount: PHASE_Q_PLAN.teamCredits, balanceAfter: PHASE_Q_PLAN.teamCredits, note: "Monthly allowance (placeholder plan)", createdAt: start } });

  // ─── What the skills made (Output library) ──────────────────────────────
  const outputs: [string, string, string | null, string | null, number, string][] = [
    ["ad_gen", "cloud cream · story ad copy", "Story 9:16", "Meta", 2, "Whipped, weightless. cloud cream melts in and stays soft all day. Fragrance-free. Shop the set →"],
    ["instagram_caption_agent", "dew drop · launch caption", "Caption", "Instagram", 3, "Glass skin, minus the effort. dew drop is here: one drop, all-day glow. Out now in SE, NO and DK."],
    [customSkillKey("tone_checker"), "Holiday email · tone check", "Copy", "Email", 4, "2 changes: swap 'amazing' (a word we avoid) for 'soft'; the DK legal line is missing at the end."],
    [customSkillKey("market_recap"), "Market recap · week 41", "Copy", null, 6, "Two competitors launched serums with 15–20% off. Stories with product-in-hand beat flat lays again (CTR +0.4 pt). Idea: a dew drop texture story."],
    ["instagram_caption_agent", "milk wash · carousel caption", "Caption", "Instagram", 8, "Your cleanser shouldn't sting. milk wash: gentle, low-foam, and gone in one rinse."],
    ["ad_gen", "sun day · retargeting ad copy", "Feed 4:5", "Meta", 12, "Still thinking about it? SPF 50 that feels like nothing. sun day, back in stock."],
  ];
  for (const [i, [key, title, format, channel, daysAgo, text]] of outputs.entries()) {
    await prisma.skillOutput.create({ data: { clientId, agentId: skillIds.get(key) ?? null, title, format, channel, text, createdByUserId: people[i % people.length].id, createdAt: new Date(now.getTime() - daysAgo * DAY) } });
  }

  // ─── More measured outputs, so two format + channel groups reach the badge rule's 4 (Output library) ───
  // Story 9:16 · Meta: the teaser joins the two Summer stories and the launch story; Square 1:1 · Meta: the teaser
  // and Summer's second square join the three measured squares. The rule is unchanged; only the data grows.
  const MEASURED: [string, string, number][] = [
    ["p00-prelaunch-teaser", "Story 9:16", 0.62],
    ["p00-prelaunch-teaser", "Square 1:1", 0.55],
    ["p02-summer-sunday", "Square 1:1", 1.48],
  ];
  for (const [pack, format, ctr] of MEASURED) {
    const a = await prisma.asset.findFirst({ where: { projectId: ctx.projectId(pack), performanceCtr: null, format: { startsWith: format }, status: { in: ["APPROVED", "DELIVERED"] } }, orderBy: { name: "asc" }, select: { id: true } });
    if (a) await prisma.asset.update({ where: { id: a.id }, data: { performanceCtr: ctr } });
  }

  // ─── Views for delivered videos without a CTR (Output library badges) ───
  const videos = await prisma.asset.findMany({ where: { clientId, type: "VIDEO", performanceCtr: null, status: { in: ["APPROVED", "DELIVERED"] } }, select: { id: true }, orderBy: { name: "asc" } });
  const VIEWS = [41200, 18600, 27400, 9800];
  for (const [i, v] of videos.entries()) await prisma.asset.update({ where: { id: v.id }, data: { performanceViews: VIEWS[i % VIEWS.length] } });

  // ─── Connections as in the design (09): TikTok needs reconnecting ───────
  const meta = (m: Record<string, unknown>) => m as object;
  const iso = (d: Date) => d.toISOString();
  const connections: [string, string, Record<string, unknown>][] = [
    ["google_drive", "CONNECTED", { folders: 2, lastSyncAt: iso(new Date(now.getTime() - 3600000)) }],
    ["notion", "CONNECTED", { workspace: "1 workspace", lastSyncAt: iso(new Date(now.getTime() - DAY)) }],
    ["meta_ads", "CONNECTED", { accounts: "ouhers SE · NO" }],
    ["tiktok_ads", "NEEDS_RECONNECT", { note: `Token expired ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(now.getTime() - 3 * DAY))}` }],
    ["google_ads", "CONNECTED", { accounts: "1 account" }],
  ];
  for (const [app, status, m] of connections) {
    await prisma.brandConnection.upsert({
      where: { clientId_app: { clientId, app } },
      update: { status, meta: meta(m) },
      create: { clientId, app, status, meta: meta(m), connectedAt: new Date(now.getTime() - 120 * DAY), isDemo: true },
    });
  }

  // ─── Billing: the plan's monthly invoices (demo amounts, no real payment data) ─
  for (const [i, p] of periods.entries()) {
    const month = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(p.start);
    await prisma.invoice.create({
      data: {
        clientId,
        number: `INV-DEMO-OUHERS-${p.key}`,
        amount: 0,
        currency: "EUR",
        status: i === periods.length - 1 ? "SENT" : "PAID",
        issuedAt: p.start,
        dueAt: new Date(p.start.getTime() + 14 * DAY),
        paidAt: i === periods.length - 1 ? null : new Date(p.start.getTime() + 5 * DAY),
        lineItems: [{ label: `${plan.name} · ${month}`, description: "Plan price not set yet (placeholder) · demo invoice" }],
      },
    });
  }
}
