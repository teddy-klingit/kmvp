import bcrypt from "bcryptjs";
import { PrismaClient, InternalRole, type Prisma } from "../src/generated/prisma";

const prisma = new PrismaClient();

// Anchor "today" a little inside the demo so due dates/ETAs read naturally
// regardless of when this seed is actually run.
const TODAY = new Date();
const days = (n: number) => new Date(TODAY.getTime() + n * 86400000);

const PASSWORD = "klingit-demo";

type SyncDelegate = {
  findFirst(args: { where: object; select: { id: true } }): Promise<{ id: string } | null>;
  update(args: { where: { id: string }; data: object }): Promise<{ id: string }>;
  create(args: { data: object }): Promise<{ id: string }>;
};

/**
 * Idempotent write: find the row by a stable natural key (e.g. a project's
 * name within its client) and update it, otherwise create it. Re-seeding
 * refreshes every date to "now" without duplicating anything — and also
 * matches rows a previous, non-idempotent seed already created.
 */
async function sync(model: unknown, where: object, data: object) {
  const delegate = model as SyncDelegate;
  const existing = await delegate.findFirst({ where, select: { id: true } });
  return existing ? delegate.update({ where: { id: existing.id }, data }) : delegate.create({ data });
}

const PIPELINE = [
  "BRIEF",
  "ESTIMATE",
  "STAFFING",
  "PRODUCTION",
  "QA",
  "FIRST_DRAFT_DELIVERY",
  "FEEDBACK",
  "FINAL_DELIVERY",
  "ARCHIVE_LEARN_MEASURE",
  "SUGGESTIONS",
] as const;
type StageName = (typeof PIPELINE)[number];
type StageSeed = { status: "UPCOMING" | "ACTIVE" | "COMPLETED"; startedAt?: Date; completedAt?: Date; etaAt?: Date; summary?: string };

/** Writes all 10 pipeline stages for a project; unspecified ones are UPCOMING with no dates. */
async function syncStages(projectId: string, stages: Partial<Record<StageName, StageSeed>>) {
  for (const [order, name] of PIPELINE.entries()) {
    const stage = stages[name] ?? { status: "UPCOMING" as const };
    const data = {
      order,
      status: stage.status,
      startedAt: stage.startedAt ?? null,
      completedAt: stage.completedAt ?? null,
      etaAt: stage.etaAt ?? null,
      summary: stage.summary ?? null,
    };
    await prisma.pipelineStage.upsert({
      where: { projectId_name: { projectId, name } },
      update: data,
      create: { projectId, name, ...data },
    });
  }
}

// ---------------------------------------------------------------------------
// Price list — illustrative placeholder rates, flagged as DRAFT in the UI.
// Deliverable-type strings here are what the Estimate agent is constrained
// to pick from, so keep them specific and production-meaningful.
// ---------------------------------------------------------------------------
const PRICE_LIST_ITEMS: { deliverableType: string; complexityTier: "LOW" | "MEDIUM" | "HIGH"; creditCost: number; notes?: string }[] = [
  { deliverableType: "Social post (static)", complexityTier: "LOW", creditCost: 2, notes: "Single platform, existing template" },
  { deliverableType: "Social post (static)", complexityTier: "MEDIUM", creditCost: 4 },
  { deliverableType: "Social post (static)", complexityTier: "HIGH", creditCost: 7, notes: "Custom illustration or photo shoot needed" },
  { deliverableType: "PPT slide", complexityTier: "LOW", creditCost: 1, notes: "Text + existing template" },
  { deliverableType: "PPT slide", complexityTier: "MEDIUM", creditCost: 2 },
  { deliverableType: "PPT slide", complexityTier: "HIGH", creditCost: 4, notes: "Custom data viz or diagram" },
  { deliverableType: "Video cutdown (<30s)", complexityTier: "LOW", creditCost: 5, notes: "Re-edit of existing footage" },
  { deliverableType: "Video cutdown (<30s)", complexityTier: "MEDIUM", creditCost: 9 },
  { deliverableType: "Video cutdown (<30s)", complexityTier: "HIGH", creditCost: 15, notes: "New motion graphics" },
  { deliverableType: "Full video production", complexityTier: "HIGH", creditCost: 30, notes: "Script to final cut, 60-90s" },
  { deliverableType: "Landing page build", complexityTier: "MEDIUM", creditCost: 16, notes: "Single page, existing component library" },
  { deliverableType: "Landing page build", complexityTier: "HIGH", creditCost: 32, notes: "Custom layout or new components" },
  { deliverableType: "Email copy", complexityTier: "LOW", creditCost: 2 },
  { deliverableType: "Email copy", complexityTier: "MEDIUM", creditCost: 4, notes: "Multi-section campaign email" },
  { deliverableType: "Brand guidelines deck", complexityTier: "HIGH", creditCost: 40, notes: "Full visual identity system" },
];

async function main() {
  console.log("Seeding…");
  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  // ---------------------------------------------------------------------
  // Price list (DRAFT placeholder rates)
  // ---------------------------------------------------------------------
  for (const item of PRICE_LIST_ITEMS) {
    await prisma.priceListItem.upsert({
      where: { deliverableType_complexityTier: { deliverableType: item.deliverableType, complexityTier: item.complexityTier } },
      update: { creditCost: item.creditCost, notes: item.notes ?? null },
      create: item,
    });
  }
  console.log("Price list seeded");

  // ---------------------------------------------------------------------
  // Agents catalog
  // ---------------------------------------------------------------------
  const agentDefs = [
    { key: "brand_os", name: "Brand OS agent", category: "FOUNDATION", description: "Maintains brand rules, updated from every deliverable." },
    { key: "guidelines", name: "Guidelines agent", category: "FOUNDATION", description: "AI brand guidelines, tone of voice, naming." },
    { key: "asset_indexer", name: "Asset indexer", category: "FOUNDATION", description: "Figma library sync and asset tagging." },
    { key: "benchmark", name: "Benchmark agent", category: "FOUNDATION", description: "Quality benchmarks from approved work." },
    { key: "market_intel_agent", name: "Market Intelligence agent", category: "FOUNDATION", description: "Synthesizes competitor activity, industry news, and internal performance into assumptions and creative ideas." },
    { key: "performance_agent", name: "Performance agent", category: "FOUNDATION", description: "Reads live campaign data across ad platforms and delivered creative performance to recommend where to double down or cut." },
    { key: "seo_agent", name: "SEO / AI Visibility agent", category: "FOUNDATION", description: "Audits the client's and competitors' sites for SEO and AI-crawler readiness, tests real AI-search visibility, and recommends fixes." },
    { key: "content_plan_agent", name: "Content Plan agent", category: "FOUNDATION", description: "Reads real content performance and business outcomes to propose adjustments to the living content calendar, for explicit approval." },
    { key: "brief_agent", name: "Brief agent", category: "BRIEF", description: "Parses client briefs and flags gaps." },
    {
      key: "brief_generator_agent",
      name: "Brief Generator",
      category: "BRIEF",
      description: "Drafts a ready-to-use creative brief for a new idea, grounded in your brand.",
    },
    { key: "estimate_agent", name: "Estimate agent", category: "ESTIMATE", description: "Scopes estimates from brief and historical data." },
    { key: "staffing_agent", name: "Staffing agent", category: "STAFFING", description: "Matches team by capacity and brand fit." },
    { key: "ad_gen", name: "Ad gen agent", category: "PRODUCTION", description: "Generates a finished, ready-to-run ad — headline and CTA rendered directly on the image, plus a caption for posting it." },
    { key: "image_gen_agent", name: "Image Gen Agent", category: "PRODUCTION", description: "Generates a standalone on-brand image or illustration — no ad text, just the visual." },
    { key: "copy", name: "Copy agent", category: "PRODUCTION", description: "Writes on-brand headlines and body copy per format." },
    { key: "linkedin_post_agent", name: "LinkedIn Post Agent", category: "PRODUCTION", description: "Writes a ready-to-post LinkedIn update in your brand voice." },
    { key: "landing_page_copy_agent", name: "Landing Page Copy Agent", category: "PRODUCTION", description: "Writes headline, subheadline, section copy, and a CTA for a landing page." },
    { key: "instagram_caption_agent", name: "Instagram Caption Agent", category: "PRODUCTION", description: "Writes an Instagram caption, hashtags, and alt text for a post." },
    { key: "email_copy_agent", name: "Email Copy Agent", category: "PRODUCTION", description: "Writes subject line options, preheader, and body copy for a marketing email." },
    { key: "motion", name: "Motion agent", category: "PRODUCTION", description: "Produces motion/video cutdowns." },
    { key: "brand_compliance", name: "Brand compliance agent", category: "PRODUCTION", description: "Checks every asset against the Brand OS." },
    { key: "qa_agent", name: "QA agent", category: "QA", description: "Checks assets against brand OS and quality benchmarks." },
    { key: "delivery_agent", name: "Delivery agent", category: "DELIVERY", description: "Packages the client handoff." },
    { key: "feedback_agent", name: "Feedback agent", category: "FEEDBACK", description: "Turns client comments into prioritized tasks." },
    { key: "archive_agent", name: "Archive agent", category: "ARCHIVE", description: "Archives delivered work and performance data." },
    { key: "learning_agent", name: "Learning agent", category: "ARCHIVE", description: "Extracts rules from outcomes into the Brand OS." },
  ] as const;

  // Agents the client can trigger themselves from Brand IQ, not just Klingit
  // staff internally — niche, single-purpose agents are self-contained
  // enough to hand directly to the client; agents tied to internal pipeline
  // stages (staffing, QA, delivery, etc.) or too broad to run unsupervised
  // (the generic Copy agent) aren't.
  const SELF_SERVICE_AGENT_KEYS = [
    "brief_generator_agent",
    "ad_gen",
    "image_gen_agent",
    "linkedin_post_agent",
    "landing_page_copy_agent",
    "instagram_caption_agent",
    "email_copy_agent",
  ];

  const agents: Record<string, { id: string }> = {};
  for (const def of agentDefs) {
    agents[def.key] = await prisma.agent.upsert({
      where: { key: def.key },
      update: { selfService: SELF_SERVICE_AGENT_KEYS.includes(def.key) },
      create: { ...def, status: "LIVE", selfService: SELF_SERVICE_AGENT_KEYS.includes(def.key) },
    });
  }

  // ---------------------------------------------------------------------
  // Staff (internal)
  // ---------------------------------------------------------------------
  async function upsertStaff(
    email: string,
    name: string,
    title: InternalRole,
    skills: string[],
    brandFitTags: string[],
    performanceRating: number,
    capacityHoursPerWeek = 40
  ) {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name, role: "INTERNAL", status: "ACTIVE", passwordHash },
    });
    return prisma.staffMember.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, title, skills, brandFitTags, capacityHoursPerWeek, performanceRating },
    });
  }

  const teddy = await upsertStaff("teddy@klingit.com", "Teddy W.", "ACCOUNT_LEAD", ["Account strategy", "Client comms"], ["Klarna", "fintech"], 4.8);
  const sara = await upsertStaff("sara.n@klingit.com", "Sara N.", "ART_DIRECTOR", ["Art direction", "Social formats"], ["Klarna", "fintech", "fashion"], 4.9);
  const marcus = await upsertStaff("marcus@klingit.com", "Marcus L.", "COPYWRITER", ["Copywriting", "EN/SE localization"], ["Klarna", "retail"], 4.3);
  const priya = await upsertStaff("priya@klingit.com", "Priya K.", "MOTION_DESIGNER", ["Motion design", "Video editing"], ["retail", "fashion"], 4.6);
  await upsertStaff("noor@klingit.com", "Noor A.", "PROJECT_MANAGER", ["QA", "Delivery management"], ["Klarna"], 4.7);
  await upsertStaff("elin.b@klingit.com", "Elin B.", "COPYWRITER", ["Copywriting", "Brand voice", "Presentation design"], ["fintech", "retail"], 4.4, 32);
  await upsertStaff("marc.t@klingit.com", "Marc T.", "ART_DIRECTOR", ["Art direction", "Presentation design", "Motion design"], ["fashion"], 4.2, 40);
  await upsertStaff("admin@klingit.com", "Admin", "ADMIN", ["Platform admin"], [], 4.0);

  // ---------------------------------------------------------------------
  // Clients
  // ---------------------------------------------------------------------
  const klarnaData: Prisma.ClientUncheckedCreateInput = {
      name: "Klarna",
      slug: "klarna",
      industry: "Fintech",
      website: "klarna.com",
      competitorBrands: ["Affirm", "Afterpay", "Zip"],
      brandSummary: "150M users · Pink-first brand, bold type, anti-bank tone",
      planTier: "SCALE",
      status: "ACTIVE",
      monthlyCreditAllowance: 40,
      creditBalance: 27,
      healthScore: 88,
      accountLeadId: teddy.id,
      renewalDate: days(120),
      onboardingCompletedAt: days(-200),
  };
  const klarna = await prisma.client.upsert({ where: { slug: "klarna" }, update: klarnaData, create: klarnaData });

  const nordlysData: Prisma.ClientUncheckedCreateInput = {
      name: "Nordlys",
      slug: "nordlys",
      industry: "Retail & fashion",
      website: "nordlys.no",
      competitorBrands: ["Fjallraven", "Patagonia", "Haglofs"],
      brandSummary: "Nordic outdoor apparel · Muted palette, editorial tone",
      planTier: "GROWTH",
      status: "ACTIVE",
      monthlyCreditAllowance: 24,
      creditBalance: 19,
      healthScore: 74,
      accountLeadId: teddy.id,
      renewalDate: days(45),
      onboardingCompletedAt: days(-60),
  };
  const nordlys = await prisma.client.upsert({ where: { slug: "nordlys" }, update: nordlysData, create: nordlysData });

  await prisma.brand.upsert({
    where: { id: `${klarna.id}-primary` },
    update: {},
    create: { id: `${klarna.id}-primary`, clientId: klarna.id, name: "Klarna", isPrimary: true },
  });

  // ---------------------------------------------------------------------
  // Client users
  // ---------------------------------------------------------------------
  async function upsertClientUser(email: string, name: string, clientId: string, jobTitle: string, permission: "OWNER" | "APPROVER" | "VIEWER") {
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: { email, name, role: "CLIENT", status: "ACTIVE", passwordHash },
    });
    return prisma.clientUser.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id, clientId, jobTitle, permission },
    });
  }

  const jack = await upsertClientUser("jack.ross@klarna.com", "Jack Ross", klarna.id, "Senior Marketing Manager", "OWNER");
  await upsertClientUser("elin.svensson@klarna.com", "Elin Svensson", klarna.id, "Brand Manager", "APPROVER");
  await upsertClientUser("noah.berg@nordlys.no", "Noah Berg", nordlys.id, "Marketing Lead", "OWNER");

  // ---------------------------------------------------------------------
  // Brand OS
  // ---------------------------------------------------------------------
  await sync(prisma.brandOS, { clientId: klarna.id }, {
      clientId: klarna.id,
      toneRules: ["Anti-bank, human, plain language", "Confident but never arrogant", "Short sentences, active voice"],
      dos: ["Use Klarna Pink as the dominant field", "Bold, oversized type for headlines", "Show real product moments"],
      donts: ["Never use bank/finance clichés", "Avoid dense legal-style copy in ads", "No stock photography"],
      approvedColors: ["#FFB3C7", "#0A0A0A", "#FFFFFF"],
      approvedTypography: ["Klarna Text", "Klarna Headline"],
      foundationPct: 94,
      indexedAssetsCount: 312,
      brandOsRulesCount: 6,
      toneGuidelinesCount: 3,
      lastSyncedAt: days(0),
  });

  await sync(prisma.brandOS, { clientId: nordlys.id }, {
      clientId: nordlys.id,
      toneRules: ["Editorial, unhurried, outdoors-first"],
      dos: ["Natural light, real terrain"],
      donts: ["No studio backdrops"],
      approvedColors: ["#2B3A2E", "#EDE6D6"],
      approvedTypography: ["Nordlys Serif"],
      foundationPct: 61,
      indexedAssetsCount: 118,
      brandOsRulesCount: 4,
      toneGuidelinesCount: 2,
      lastSyncedAt: days(-1),
  });

  // ---------------------------------------------------------------------
  // Projects — Klarna. Every row below is matched by a stable natural key
  // (see sync()), so re-running the seed refreshes the demo in place.
  // ---------------------------------------------------------------------

  // 1) Q3 App install — IN_PRODUCTION (flagship demo project). Team confirmed
  // yesterday, so the first draft is due within 2 business days of that.
  const q3 = await sync(prisma.project, { clientId: klarna.id, name: "Q3 App install campaign" }, {
    clientId: klarna.id,
    name: "Q3 App install campaign",
    status: "IN_PRODUCTION",
    startedAt: days(-5),
    dueDate: days(6),
    deliveredAt: null,
    creditsQuoted: 34,
    priceAmount: 5440,
    priceCurrency: "EUR",
  });
  await syncStages(q3.id, {
    BRIEF: { status: "COMPLETED", startedAt: days(-5), completedAt: days(-5), summary: "Jack submitted brief. 2 gaps flagged and resolved by agent." },
    ESTIMATE: { status: "COMPLETED", startedAt: days(-4), completedAt: days(-3), summary: "34-credit scope approved by Jack Ross." },
    STAFFING: { status: "COMPLETED", startedAt: days(-3), completedAt: days(-1), summary: "Team confirmed: Sara N., Marcus L., Priya K." },
    PRODUCTION: { status: "ACTIVE", startedAt: days(-1), etaAt: days(1), summary: "Ad gen agent generating 14 social formats. Copy agent EN complete, SE in progress." },
    QA: { status: "UPCOMING", etaAt: days(2) },
    FIRST_DRAFT_DELIVERY: { status: "UPCOMING", etaAt: days(2) },
    FEEDBACK: { status: "UPCOMING", etaAt: days(4) },
    FINAL_DELIVERY: { status: "UPCOMING", etaAt: days(6) },
  });
  const q3BriefData = {
    projectId: q3.id,
    submittedByUserId: jack.id,
    goals: "Drive app installs among existing web checkout users ahead of Q3.",
    targetAudience: "Existing Klarna web users, 22-40, mobile-first.",
    successMetrics: "CTR > 5%, CPI < EUR 2.10.",
    status: "ACCEPTED" as const,
    submittedAt: days(-5),
    acceptedAt: days(-5),
    gapsFlagged: [],
  };
  await prisma.brief.upsert({ where: { projectId: q3.id }, update: q3BriefData, create: q3BriefData });

  const q3EstimateData = {
    projectId: q3.id,
    sentByStaffId: teddy.id,
    status: "APPROVED" as const,
    totalHours: 34,
    totalCredits: 34,
    totalPrice: 5440,
    currency: "EUR",
    sentAt: days(-4),
    expiresAt: days(0),
    respondedAt: days(-3),
    notes: "Based on your brief we have scoped 3 deliverable streams. Happy to adjust scope before approval — just reply here or schedule a call.",
    inclusions: [
      "Dedicated art director with Klarna experience",
      "AI-assisted production for speed and consistency",
      "Brand compliance check on every asset",
      "2 rounds of revisions included",
      "Final packaged handoff with usage guide",
    ],
  };
  const q3Estimate = await prisma.estimate.upsert({ where: { projectId: q3.id }, update: q3EstimateData, create: q3EstimateData });
  for (const item of [
    { deliverable: "Social ads", detail: "6 formats × 3 variants · Static and motion", hours: 18, credits: 18, order: 0 },
    { deliverable: "Display", detail: "4 sizes · HTML5 + static fallback", hours: 10, credits: 10, order: 1 },
    { deliverable: "Copy", detail: "Headlines and body copy · EN and SE", hours: 6, credits: 6, order: 2 },
  ]) {
    await sync(prisma.estimateLineItem, { estimateId: q3Estimate.id, order: item.order }, { estimateId: q3Estimate.id, ...item });
  }

  async function syncTeam(projectId: string, confirmedAt: Date, members: { staffMemberId: string; roleOnProject: string; recommended: boolean; allocatedHours: number }[]) {
    const teamData = { projectId, proposedByStaffId: teddy.id, confirmed: true, confirmedAt };
    const team = await prisma.team.upsert({ where: { projectId }, update: teamData, create: teamData });
    for (const m of members) {
      await sync(prisma.teamMember, { teamId: team.id, staffMemberId: m.staffMemberId }, { teamId: team.id, ...m });
    }
  }
  await syncTeam(q3.id, days(-1), [
    { staffMemberId: sara.id, roleOnProject: "Art director", recommended: true, allocatedHours: 14 },
    { staffMemberId: marcus.id, roleOnProject: "Copywriter", recommended: true, allocatedHours: 8 },
    { staffMemberId: priya.id, roleOnProject: "Motion designer", recommended: false, allocatedHours: 6 },
  ]);

  async function syncAsset(projectId: string, name: string, format: string, color: string, status: "APPROVED" | "IN_REVIEW" | "CHANGES_REQUESTED", ctr: number | null) {
    return sync(prisma.asset, { projectId, name }, {
      projectId,
      clientId: klarna.id,
      name,
      format,
      type: "IMAGE",
      thumbnailColor: color,
      status,
      performanceCtr: ctr,
    });
  }
  await syncAsset(q3.id, "Story 9:16 — hero", "Story 9:16", "var(--avatar-2)", "IN_REVIEW", 6.8);
  await syncAsset(q3.id, "1080x1080 static", "Static 1:1", "var(--avatar-3)", "IN_REVIEW", null);

  for (const run of [
    { agentId: agents.ad_gen.id, status: "SUCCESS" as const, decision: "Social formats 14/18 complete", output: { completed: 14, total: 18 } },
    { agentId: agents.copy.id, status: "SUCCESS" as const, decision: "EN done · SE in progress", output: { en: "done", se: "in_progress" } },
    { agentId: agents.motion.id, status: "FLAGGED" as const, decision: "Waiting — starts after statics approved", output: {} },
    { agentId: agents.brand_compliance.id, status: "SUCCESS" as const, decision: "Checking vs. Klarna brand OS", output: {} },
  ]) {
    await sync(prisma.agentRun, { projectId: q3.id, agentId: run.agentId, decision: run.decision }, { projectId: q3.id, clientId: klarna.id, ...run });
  }

  // 2) Summer social pack — AWAITING_REVIEW (first draft delivered today, client reviewing)
  const summer = await sync(prisma.project, { clientId: klarna.id, name: "Summer social pack" }, {
    clientId: klarna.id,
    name: "Summer social pack",
    status: "AWAITING_REVIEW",
    startedAt: days(-6),
    deliveredAt: days(0),
    dueDate: days(3),
    creditsQuoted: 22,
    priceAmount: 3520,
    priceCurrency: "EUR",
  });
  await syncStages(summer.id, {
    BRIEF: { status: "COMPLETED", completedAt: days(-6) },
    ESTIMATE: { status: "COMPLETED", completedAt: days(-5) },
    STAFFING: { status: "COMPLETED", completedAt: days(-3) },
    PRODUCTION: { status: "COMPLETED", completedAt: days(-1) },
    QA: { status: "COMPLETED", completedAt: days(-1) },
    FIRST_DRAFT_DELIVERY: { status: "COMPLETED", completedAt: days(0) },
    FEEDBACK: { status: "ACTIVE", startedAt: days(0) },
    FINAL_DELIVERY: { status: "UPCOMING", etaAt: days(3) },
  });
  await syncTeam(summer.id, days(-3), [
    { staffMemberId: sara.id, roleOnProject: "Art director", recommended: true, allocatedHours: 10 },
    { staffMemberId: marcus.id, roleOnProject: "Copywriter", recommended: true, allocatedHours: 6 },
  ]);
  const summerAssets: [string, string, string, "APPROVED" | "CHANGES_REQUESTED" | "IN_REVIEW", number | null][] = [
    ["Story 9:16 — beach hero", "Story 9:16", "var(--avatar-1)", "APPROVED", 7.4],
    ["Story 9:16 — product close", "Story 9:16", "var(--avatar-3)", "APPROVED", 4.2],
    ["Carousel — 3 slide", "Carousel", "var(--avatar-4)", "CHANGES_REQUESTED", 5.1],
    ["Static 1:1 — lifestyle", "Static 1:1", "var(--avatar-6)", "IN_REVIEW", null],
    ["Banner 300x250", "Banner", "var(--avatar-5)", "IN_REVIEW", 2.8],
    ["Static 1:1 — product", "Static 1:1", "var(--avatar-8)", "IN_REVIEW", 2.1],
  ];
  const summerAssetRows = [];
  for (const [name, format, color, status, ctr] of summerAssets) {
    summerAssetRows.push(await syncAsset(summer.id, name, format, color, status, ctr));
  }
  const carouselComment = "Asset 3 feels too corporate — can we go warmer and more authentic in the lifestyle imagery?";
  await sync(prisma.comment, { projectId: summer.id, body: carouselComment }, {
    projectId: summer.id,
    assetId: summerAssetRows[2].id,
    authorClientUserId: jack.id,
    body: carouselComment,
    createdAt: days(0),
  });

  // 3) Autumn brand refresh — BRIEFING, with a flagged gap
  const autumn = await sync(prisma.project, { clientId: klarna.id, name: "Autumn brand refresh" }, {
    clientId: klarna.id,
    name: "Autumn brand refresh",
    status: "BRIEFING",
    dueDate: days(24),
  });
  await syncStages(autumn.id, { BRIEF: { status: "ACTIVE", startedAt: days(-1) } });
  const autumnBriefData = {
    projectId: autumn.id,
    submittedByUserId: jack.id,
    goals: "Refresh brand presence ahead of autumn product line.",
    status: "GAPS_FLAGGED" as const,
    submittedAt: days(-1),
    gapsFlagged: ["Missing success metrics on Autumn campaign brief"],
  };
  await prisma.brief.upsert({ where: { projectId: autumn.id }, update: autumnBriefData, create: autumnBriefData });

  // 4) Spring product launch — ARCHIVED (historical, for billing/usage/archive)
  const spring = await sync(prisma.project, { clientId: klarna.id, name: "Spring product launch" }, {
    clientId: klarna.id,
    name: "Spring product launch",
    status: "ARCHIVED",
    startedAt: days(-100),
    deliveredAt: days(-70),
    dueDate: days(-70),
    creditsQuoted: 28,
    creditsActual: 30,
    priceAmount: 4480,
    priceCurrency: "EUR",
  });
  await syncStages(spring.id, {
    BRIEF: { status: "COMPLETED" },
    ESTIMATE: { status: "COMPLETED" },
    STAFFING: { status: "COMPLETED" },
    PRODUCTION: { status: "COMPLETED" },
    QA: { status: "COMPLETED" },
    FIRST_DRAFT_DELIVERY: { status: "COMPLETED" },
    FEEDBACK: { status: "COMPLETED" },
    FINAL_DELIVERY: { status: "COMPLETED", completedAt: days(-70) },
    ARCHIVE_LEARN_MEASURE: { status: "COMPLETED", completedAt: days(-69) },
    SUGGESTIONS: { status: "COMPLETED", completedAt: days(-69) },
  });

  await sync(prisma.invoice, { number: "INV-2026-0142" }, {
    clientId: klarna.id,
    projectId: spring.id,
    number: "INV-2026-0142",
    amount: 4480,
    currency: "EUR",
    status: "PAID",
    issuedAt: days(-69),
    dueAt: days(-55),
    paidAt: days(-60),
    lineItems: [{ label: "Spring product launch — full scope", amount: 4480 }],
  });
  await sync(prisma.invoice, { number: "INV-2026-0198" }, {
    clientId: klarna.id,
    number: "INV-2026-0198",
    amount: 5440,
    currency: "EUR",
    status: "SENT",
    issuedAt: days(-2),
    dueAt: days(28),
    lineItems: [{ label: "Q3 App install campaign — deposit", amount: 5440 }],
  });

  // Credit ledger — keyed by note + resulting balance (the allowance note repeats monthly).
  for (const entry of [
    { type: "ALLOWANCE" as const, amount: 40, balanceAfter: 40, note: "Monthly allowance", createdAt: days(-30) },
    { projectId: summer.id, type: "CONSUMPTION" as const, amount: -22, balanceAfter: 24, note: "Summer social pack scope", createdAt: days(-5) },
    { projectId: q3.id, type: "CONSUMPTION" as const, amount: -34, balanceAfter: 6, note: "Q3 App install campaign scope", createdAt: days(-3) },
    { type: "ALLOWANCE" as const, amount: 40, balanceAfter: 46, note: "Monthly allowance", createdAt: days(-2) },
    { type: "ADJUSTMENT" as const, amount: 3, balanceAfter: 27, note: "Goodwill credit — late revision turnaround", createdAt: days(-1) },
  ]) {
    await sync(prisma.creditLedgerEntry, { clientId: klarna.id, note: entry.note, balanceAfter: entry.balanceAfter }, { clientId: klarna.id, ...entry });
  }

  // Touchpoints
  await sync(prisma.touchpoint, { clientId: klarna.id, title: "Campaign sync" }, { clientId: klarna.id, withClientUserId: jack.id, title: "Campaign sync", scheduledAt: days(2) });
  await sync(prisma.touchpoint, { clientId: klarna.id, title: "Quarterly brand review" }, { clientId: klarna.id, title: "Quarterly brand review", scheduledAt: days(9) });

  // Notifications — project-linked ones are informational; the dashboard reads project state.
  for (const n of [
    { projectId: summer.id, type: "DELIVERY_READY" as const, title: "Delivery review", body: "Summer social pack · 6 assets ready to review" },
    { projectId: autumn.id, type: "SYSTEM" as const, title: "Brief input needed", body: "Missing success metrics on Autumn campaign brief", actionLabel: "Add info" },
  ]) {
    await sync(prisma.notification, { userId: jack.userId, projectId: n.projectId, title: n.title }, {
      userId: jack.userId,
      clientId: klarna.id,
      actionUrl: `/projects/${n.projectId}`,
      actionLabel: "Review",
      createdAt: days(0),
      ...n,
    });
  }
  // The Q3 estimate was approved long ago — make sure its old approval prompt isn't left unread.
  await prisma.notification.updateMany({
    where: { userId: jack.userId, projectId: q3.id, type: "APPROVAL_NEEDED" },
    data: { read: true },
  });

  await prisma.notificationPreference.upsert({
    where: { userId: jack.userId },
    update: {},
    create: { userId: jack.userId },
  });

  // Market intelligence signals are generated for real from live
  // competitor/news checks (see src/lib/integrations/market-signals.ts) —
  // no fixture data seeded here.

  for (const insp of [
    { title: "Checkout-moment story ads", description: "Short vertical stories shot at the point of purchase decision.", formatTags: ["Story", "Vertical video"], thumbnailColor: "var(--avatar-2)" },
    { title: "Pink takeover display", description: "High-contrast display set leaning fully into brand pink.", formatTags: ["Display", "Static"], thumbnailColor: "var(--avatar-1)" },
  ]) {
    await sync(prisma.inspiration, { clientId: klarna.id, title: insp.title }, { clientId: klarna.id, ...insp });
  }

  for (const t of [
    { clientId: klarna.id, name: "Social story — product hero", figmaUrl: "https://figma.com/file/klarna-story", category: "Social", previewColor: "var(--avatar-1)", usageCount: 34 },
    { clientId: klarna.id, name: "Display banner set", figmaUrl: "https://figma.com/file/klarna-display", category: "Display", previewColor: "var(--avatar-3)", usageCount: 21 },
    { clientId: null, name: "Copy deck template", figmaUrl: "https://figma.com/file/copy-deck", category: "Copy", previewColor: "var(--avatar-6)", usageCount: 58 },
  ]) {
    await sync(prisma.template, { clientId: t.clientId, name: t.name }, t);
  }

  console.log("Seed complete.");
  console.log("Demo password for every seeded user:", PASSWORD);
  console.log("Client portal: jack.ross@klarna.com");
  console.log("Ops console:   teddy@klingit.com");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
