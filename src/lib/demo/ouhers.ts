import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import type { AssetStatus, AssetVersionState, ClientPermission, InternalRole, PipelineStageName, Prisma, ProjectStatus, ProjectType, StageStatus } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { removeUploadsUnder, writeUploadAt } from "@/lib/uploads";
import { PIPELINE_STAGE_ORDER } from "@/lib/labels";
import { DEMO_PASSWORD } from "@/lib/demo-personas";
import { addBusinessDays, FIRST_DRAFT_BUSINESS_DAYS } from "@/lib/project-state";
import { periodFor } from "@/lib/report-data";
import { specChecks } from "@/lib/qc/specs";
import { briefQuality } from "@/lib/brief-studio/quality";
import { deliverablesText } from "@/lib/brief-studio/planner";
import type { BriefSection, StudioMessage, StudioQuestion } from "@/lib/brief-studio/model";
import { loadBrandHealth } from "@/lib/brand-health";
import { estimatePreview, type PriceEntry } from "@/lib/brief-studio/formats";
import type { AgentBuild, BuildStep } from "@/lib/agent-build";

/**
 * The ouhers demo client (prisma/demo/ouhers, read README.md there): a complete fictional account for demoing every
 * part of Klingit. Idempotent: it deletes and recreates only this client (CLIENT_ID) and its own files, never other
 * clients. Computed things (Brand health, brief quality, the Brand OS check) are computed here by the app's own
 * functions and logged next to the pack's "expected" notes.
 */

export const OUHERS_CLIENT_ID = "client-ouhers";
const DATA_TODAY = Date.UTC(2026, 9, 6);
const DAY = 86400000;
const FILES = "demo/ouhers";

type Json = Record<string, unknown>;
type PackProject = Json & {
  id: string;
  title: string;
  clientStage: string;
  internalStage: string;
  type: string;
  channels?: string[];
  markets?: string[];
  createdAt: string;
  deliveredAt?: string;
  archivedAt?: string;
  dueAt?: string;
  wantedBy?: string;
  firstDraftAt?: string;
  queuePosition?: number;
  kind?: string;
  credits: { estimated?: [number, number] | null; final?: number; reserved?: number; buildCost?: number; perRunEstimate?: number };
  team?: string[];
  brief?: Json;
  estimate?: { lines: { deliverable: string; qty?: number; credits: number }[]; total: number; approvedBy?: string; approvedAt?: string; status?: string; sentAt?: string };
  versions?: { n: number; sentToClient: string; qc: { passed: number; total: number; accepted?: number; fixedBeforeSend?: number; flags?: { asset: string; check: string; text: string; resolution: string }[] }; changes?: string[] }[];
  assets?: { file: string; concept: string; size: string; version: number; frame: number | null; slide: number | null; clientVisible: boolean }[];
  approvals?: { by: string; at: string; scope: string; concept?: string }[];
  comments?: { pin: number | null; asset: string | null; x?: number; y?: number; region?: { w: number; h: number }; scope?: string; thread: { author: string; at: string; text: string; channel: string; source: string }[]; resolved?: boolean }[];
  copy?: { elements: { element: string; sv: string; no: string; da: string; status: string; suggestion?: { by: string; lang: string; from: string; to: string } }[] };
};

export type SeedReport = { lines: string[]; checks: { what: string; computed: string; expected: string; match: boolean }[] };

const MARKET = { SE: "Sweden", NO: "Norway", DK: "Denmark" } as Record<string, string>;
const LANGUAGE = { SE: "Swedish", NO: "Norwegian", DK: "Danish" } as Record<string, string>;
const FORMAT: Record<string, string> = { "9x16": "Story 9:16", "4x5": "Feed 4:5", "1x1": "Square 1:1", "191x1": "Link ad 1.91:1", "1440": "Product page 1440" };
const CHANNEL: Record<string, string> = { meta: "Meta", tiktok: "TikTok", instagram: "Meta", web: "Web", email: "Email", print: "Print" };
const ROLE: Record<string, { title: InternalRole; onProject: string; skills?: string[] }> = {
  "Account lead · PM": { title: "ACCOUNT_LEAD", onProject: "Account lead" },
  Designer: { title: "ART_DIRECTOR", onProject: "Designer" },
  "Motion designer": { title: "MOTION_DESIGNER", onProject: "Motion designer" },
  Copywriter: { title: "COPYWRITER", onProject: "Copywriter" },
  // There's no web developer role yet: a designer with the skill.
  "Web developer": { title: "ART_DIRECTOR", onProject: "Web developer", skills: ["web development"] },
};
const PERMISSION: Record<string, ClientPermission> = { admin: "OWNER", editor: "APPROVER", viewer: "VIEWER" };
const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };

/** Where each pack stage lands in our model. */
function statusFor(p: PackProject): ProjectStatus {
  if (p.clientStage === "archived") return "ARCHIVED";
  if (p.clientStage === "delivered") return "DELIVERED";
  if (p.clientStage === "in_review") return "AWAITING_REVIEW";
  if (p.clientStage === "draft") return "DRAFT";
  if (p.clientStage === "queued") return p.internalStage === "estimate_sent" ? "ESTIMATING" : "STAFFING";
  return "IN_PRODUCTION";
}

const STAGE_AT: Record<ProjectStatus, PipelineStageName | null> = {
  DRAFT: "BRIEF",
  BRIEFING: "BRIEF",
  ESTIMATING: "ESTIMATE",
  STAFFING: "STAFFING",
  IN_PRODUCTION: "PRODUCTION",
  QA: "QA",
  AWAITING_REVIEW: "FEEDBACK",
  IN_FEEDBACK: "FINAL_DELIVERY",
  DELIVERED: null,
  PAUSED: "PRODUCTION",
  ARCHIVED: null,
};

const typeFor = (t: string): ProjectType => (/video/i.test(t) ? "MOTION_VIDEO" : /web/i.test(t) ? "DEVELOPMENT" : /ad set|launch|carousel|social/i.test(t) ? "CAMPAIGN" : "OTHER");

export async function seedOuhers(opts: { dir?: string; shift?: boolean; log?: (s: string) => void } = {}): Promise<SeedReport> {
  const dir = opts.dir ?? path.join(process.cwd(), "prisma/demo/ouhers");
  if (!existsSync(path.join(dir, "data/account.json"))) throw new Error(`The ouhers demo pack isn't at ${dir}`);
  const report: SeedReport = { lines: [], checks: [] };
  const say = (s: string) => {
    report.lines.push(s);
    opts.log?.(s);
  };
  const check = (what: string, computed: string | number, expected: string | number) => {
    const c = { what, computed: String(computed), expected: String(expected), match: String(computed) === String(expected) };
    report.checks.push(c);
    say(`  ${c.match ? "✓" : "≠"} ${what}: computed ${c.computed} · expected ${c.expected}`);
  };
  const read = <T>(f: string): T => JSON.parse(readFileSync(path.join(dir, "data", f), "utf8")) as T;

  // "Today" in the data is 2026-10-06; SEED_SHIFT (default on) moves every date so that day is today.
  const todayUtc = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
  const offset = opts.shift === false ? 0 : Math.round((todayUtc - DATA_TODAY) / DAY) * DAY;
  const at = (s: string) => new Date((s.length === 10 ? Date.parse(`${s}T10:00:00+02:00`) : Date.parse(s)) + offset);
  const day = (s: string) => new Date(Date.parse(`${s}T00:00:00Z`) + offset).toISOString().slice(0, 10);
  const now = new Date(DATA_TODAY + offset + 10 * 3600000);
  say(`Seeding ouhers · data today 2026-10-06 → ${now.toISOString().slice(0, 10)}${offset ? ` (shifted ${offset / DAY} days)` : ""}`);

  const account = read<{
    client: Json & { name: string; legalName: string; industry: string; website: string; clientSince: string };
    plan: { activeSlots: number; monthlyCredits: number; creditBalance: number; renews: string; creditsUsedByMonth: Record<string, number> };
    clientUsers: { id: string; name: string; email: string; role: string; permission: string }[];
    klingitTeam: { id: string; name: string; role: string }[];
    connections: { source: string; status: string; since?: string }[];
  }>("account.json");
  const brand = read<Json & { summary: string; platform: Record<string, { status: string; text?: string; items?: string[] }>; personas: { id: string; name: string; age: string; summary: string; barrier: string; channels: string[]; markets: string[] }[]; visualIdentity: Json & { colorPalette: { name: string; hex: string; role: string }[]; approvedTypography: unknown[]; logos: { file: string; use: string }[]; logoRules: string[]; imageryStyle: { text: string } }; voice: { voiceAttributes: string[]; toneRules: string[]; wordsWeUse: string[]; wordsWeAvoid: string[]; mustInclude: { market: string; text: string }[]; examples: { context: string; text: string }[] }; products: { name: string; type: string }[]; sources: { type: string; name: string; items: number }[]; library: { file: string; tags: string[] }[]; competitors: { name: string; note: string }[]; health: { expected: Record<string, string> } }>("brand-os.json");
  const projects = read<PackProject[]>("projects.json");
  const manifest = JSON.parse(readFileSync(path.join(dir, "creatives/manifest.json"), "utf8")) as { file: string; width: number; height: number }[];

  // ─── Start clean: only this client and what hangs off it ─────────────────
  const userEmails = account.clientUsers.map((u) => u.email);
  const oldProjects = (await prisma.project.findMany({ where: { clientId: OUHERS_CLIENT_ID }, select: { id: true } })).map((p) => p.id);
  await prisma.agentRun.deleteMany({ where: { OR: [{ clientId: OUHERS_CLIENT_ID }, { projectId: { in: oldProjects } }] } });
  await prisma.notification.deleteMany({ where: { OR: [{ clientId: OUHERS_CLIENT_ID }, { projectId: { in: oldProjects } }, { user: { email: { in: userEmails } } }] } });
  await prisma.template.deleteMany({ where: { clientId: OUHERS_CLIENT_ID } });
  await prisma.invoice.deleteMany({ where: { clientId: OUHERS_CLIENT_ID } });
  await prisma.creditLedgerEntry.deleteMany({ where: { clientId: OUHERS_CLIENT_ID } });
  await prisma.client.deleteMany({ where: { id: OUHERS_CLIENT_ID } });
  await removeUploadsUnder(FILES);

  // ─── People ──────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(process.env.DEMO_PASSWORD || DEMO_PASSWORD, 10);
  const staffIds = new Map<string, { userId: string; staffId: string }>();
  for (const k of account.klingitTeam) {
    const role = ROLE[k.role] ?? ROLE.Designer;
    // Link to an existing staff member with that name; otherwise a demo staff member.
    const existing = await prisma.staffMember.findFirst({ where: { user: { name: k.name } }, select: { id: true, userId: true } });
    if (existing) {
      staffIds.set(k.id, { userId: existing.userId, staffId: existing.id });
      continue;
    }
    const email = `${k.name.toLowerCase().replace(/[^a-z]+/g, ".").replace(/\.$/, "")}@klingit.demo`;
    const user = await prisma.user.upsert({ where: { email }, update: { name: k.name }, create: { name: k.name, email, role: "INTERNAL", status: "ACTIVE" } });
    const staff = await prisma.staffMember.upsert({ where: { userId: user.id }, update: { title: role.title }, create: { userId: user.id, title: role.title, skills: role.skills ?? [] } });
    staffIds.set(k.id, { userId: user.id, staffId: staff.id });
  }
  const teamOf = (ids: string[] = []) => ids.flatMap((id) => (staffIds.get(id) ? [{ ...staffIds.get(id)!, role: account.klingitTeam.find((k) => k.id === id)!.role }] : []));
  const clientUserIds = new Map<string, { userId: string; clientUserId: string }>();

  // ─── Client, plan and Brand OS ───────────────────────────────────────────
  const teddy = staffIds.get("kl-teddy");
  await prisma.client.create({
    data: {
      id: OUHERS_CLIENT_ID,
      name: account.client.name,
      slug: "ouhers-demo",
      industry: account.client.industry,
      website: account.client.website,
      competitorBrands: brand.competitors.map((c) => c.name),
      brandSummary: brand.platform.ourBrand.text,
      planTier: "SCALE",
      status: "ACTIVE",
      monthlyCreditAllowance: account.plan.monthlyCredits,
      creditBalance: account.plan.creditBalance,
      renewalDate: at(account.plan.renews),
      isDemo: true,
      paidMediaInScope: true,
      demoSources: ["Instagram", "Google Analytics"],
      accountLeadId: teddy?.staffId ?? null,
      onboardingCompletedAt: at(account.client.clientSince),
      createdAt: at(account.client.clientSince),
    },
  });
  for (const u of account.clientUsers) {
    const user = await prisma.user.upsert({ where: { email: u.email }, update: { name: u.name, passwordHash, status: "ACTIVE", role: "CLIENT" }, create: { name: u.name, email: u.email, role: "CLIENT", status: "ACTIVE", passwordHash } });
    await prisma.clientUser.deleteMany({ where: { userId: user.id } });
    const cu = await prisma.clientUser.create({ data: { userId: user.id, clientId: OUHERS_CLIENT_ID, jobTitle: u.role, permission: PERMISSION[u.permission] ?? "VIEWER" } });
    clientUserIds.set(u.id, { userId: user.id, clientUserId: cu.id });
  }
  const maja = clientUserIds.get("ou-maja")!;
  const authorOf = (id: string) => (id.startsWith("kl-") ? { authorUserId: staffIds.get(id)?.userId ?? null } : { authorClientUserId: clientUserIds.get(id)?.clientUserId ?? null });
  const userOf = (id: string) => (id.startsWith("kl-") ? staffIds.get(id)?.userId : clientUserIds.get(id)?.userId) ?? null;
  say(`Client "${account.client.name}" (${OUHERS_CLIENT_ID}) · ${account.clientUsers.length} client users · ${staffIds.size} Klingit staff`);

  const p = brand.platform;
  await prisma.brandOS.create({
    data: {
      clientId: OUHERS_CLIENT_ID,
      vision: p.vision.text,
      mission: p.mission.text,
      coreValues: (p.coreValues.items ?? []).map((t) => ({ title: t, description: "" })),
      usps: p.usps.items ?? [],
      competitiveNote: p.marketPosition.status === "done" ? p.marketPosition.text : null,
      servicesNote: p.servicesProducts.text,
      keyProducts: brand.products.map((x) => `${x.name} · ${x.type}`),
      audiencePersonas: brand.personas.map((x) => ({ id: x.id, name: x.name, ageRange: x.age, description: x.summary, barrier: x.barrier, traits: [...x.channels, ...x.markets] })),
      voiceAttributes: brand.voice.voiceAttributes.map((label) => ({ label })),
      toneRules: brand.voice.toneRules,
      dos: [...brand.voice.wordsWeUse.map((w) => `Use "${w}"`), ...brand.voice.mustInclude.map((m) => `Legal line, ${m.market}: ${m.text}`)],
      donts: brand.voice.wordsWeAvoid.map((w) => `Avoid "${w}"`),
      colorPalette: brand.visualIdentity.colorPalette.map((c) => ({ name: c.name, hex: c.hex, role: c.role })),
      approvedColors: brand.visualIdentity.colorPalette.map((c) => c.hex),
      approvedTypography: brand.visualIdentity.approvedTypography as Prisma.InputJsonValue,
      imageryStyle: brand.visualIdentity.imageryStyle.text,
      lastSyncedAt: now,
    },
  });
  const SOURCE_APP: Record<string, string> = { google_drive: "google_drive", figma: "figma", notion: "notion", website: "web" };
  const SOURCE_URL: Record<string, string> = { google_drive: "https://drive.google.com/", figma: "https://www.figma.com/", notion: "https://www.notion.so/", website: account.client.website };
  for (const s of brand.sources.filter((s) => SOURCE_APP[s.type])) {
    await prisma.brandSource.create({ data: { clientId: OUHERS_CLIENT_ID, app: SOURCE_APP[s.type], url: SOURCE_URL[s.type], title: s.name, isDemo: true, createdByUserId: maja.userId } });
  }
  for (const c of account.connections.filter((c) => ["figma", "google_drive", "notion"].includes(c.source) && c.status === "connected")) {
    await prisma.brandConnection.create({ data: { clientId: OUHERS_CLIENT_ID, app: c.source, status: "CONNECTED", connectedAt: c.since ? at(c.since) : now, isDemo: true } });
  }
  for (const c of brand.competitors) {
    await prisma.competitorProfile.create({ data: { clientId: OUHERS_CLIENT_ID, brand: c.name, positioning: c.note, themes: [], activityLevel: "Medium", generatedAt: now } });
  }

  // Brand files go through the normal upload storage; the relative path is the name (and the storage key).
  const store = async (rel: string) => {
    const data = readFileSync(path.join(dir, rel));
    const saved = await writeUploadAt(`${FILES}/${rel}`, data);
    return { ...saved, mimeType: MIME[path.extname(rel).toLowerCase()] ?? "application/octet-stream" };
  };
  for (const l of brand.visualIdentity.logos) {
    for (const rel of [l.file, l.file.replace(/\.svg$/, ".png")]) {
      if (!existsSync(path.join(dir, rel))) continue;
      await store(rel);
      const a = await prisma.brandAsset.create({ data: { clientId: OUHERS_CLIENT_ID, name: rel, category: "LOGO", variant: l.use, format: path.extname(rel).slice(1).toUpperCase(), previewColor: "#F6CDB8" } });
      await prisma.brandAsset.update({ where: { id: a.id }, data: { fileUrl: `/api/brand-assets/${a.id}` } });
    }
  }
  for (const l of brand.library) {
    await store(l.file);
    const a = await prisma.brandAsset.create({ data: { clientId: OUHERS_CLIENT_ID, name: l.file, category: "PHOTOGRAPHY", variant: l.tags.join(", "), format: "JPG", previewColor: "#FBF6F0" } });
    await prisma.brandAsset.update({ where: { id: a.id }, data: { fileUrl: `/api/brand-assets/${a.id}` } });
  }
  say(`Brand OS · ${brand.visualIdentity.logos.length} logos, ${brand.library.length} photos uploaded`);

  // ─── Projects ────────────────────────────────────────────────────────────
  const prices: PriceEntry[] = (await prisma.priceListItem.findMany({ where: { archivedAt: null } })).map((x) => ({ deliverableType: x.deliverableType, complexityTier: x.complexityTier, creditCost: x.creditCost, leadTimeDays: x.leadTimeDays }));
  const brandFacts = { voice: true, visual: true, linkedSources: brand.sources.length };
  const projectId = (packId: string) => `ouhers-${packId}`;
  const fileAsset = new Map<string, string>();
  const fileVersion = new Map<string, string>();
  let checkTotals = { passed: 0, total: 0 };

  for (const pr of projects) {
    const id = projectId(pr.id);
    const status = statusFor(pr);
    const created = at(pr.createdAt);
    const approvedAt = pr.estimate?.approvedAt ? at(pr.estimate.approvedAt) : null;
    const active = ["in_review", "active"].includes(pr.clientStage);
    await prisma.project.create({
      data: {
        id,
        clientId: OUHERS_CLIENT_ID,
        name: pr.title,
        type: typeFor(pr.type),
        status,
        agentBuild: pr.kind === "agent_build",
        createdAt: created,
        startedAt: status === "DRAFT" ? null : created,
        deliveredAt: pr.deliveredAt ? at(pr.deliveredAt) : pr.versions?.length && status === "AWAITING_REVIEW" ? at(pr.versions[0].sentToClient) : null,
        dueDate: pr.dueAt ? at(pr.dueAt) : pr.wantedBy ? at(pr.wantedBy) : null,
        activatedAt: active ? (approvedAt ?? created) : status === "DELIVERED" || status === "ARCHIVED" ? created : null,
        queuePosition: pr.queuePosition ?? null,
        creditsQuoted: pr.credits.reserved ?? pr.estimate?.total ?? pr.credits.buildCost ?? null,
        creditsActual: pr.credits.final ?? null,
        priceCurrency: "SEK",
        createdByClientUserId: maja.clientUserId,
      },
    });

    // The team: confirmed when the estimate was approved; for a pack first-draft date, on the day our
    // first-draft rule (2 business days after the team is confirmed) lands on it.
    const teamConfirmedAt = pr.firstDraftAt ? businessDaysBefore(at(pr.firstDraftAt), FIRST_DRAFT_BUSINESS_DAYS) : (approvedAt ?? created);
    // Active work whose first draft is already out (dew drop's storyboard, the website design, the agent's test run).
    const draftOut = pr.clientStage === "active" && !pr.firstDraftAt ? addBusinessDays(teamConfirmedAt, FIRST_DRAFT_BUSINESS_DAYS) : null;
    // Pipeline stages: everything before the current one done, the current one active.
    const current = STAGE_AT[status];
    const currentIdx = current ? PIPELINE_STAGE_ORDER.indexOf(current) : status === "DRAFT" ? 0 : PIPELINE_STAGE_ORDER.indexOf("ARCHIVE_LEARN_MEASURE");
    await prisma.pipelineStage.createMany({
      data: PIPELINE_STAGE_ORDER.map((name, order) => {
        const st: StageStatus = status === "DELIVERED" || status === "ARCHIVED" ? (name === "SUGGESTIONS" ? "UPCOMING" : "COMPLETED") : order < currentIdx || (draftOut && name === "FIRST_DRAFT_DELIVERY") ? "COMPLETED" : order === currentIdx ? "ACTIVE" : "UPCOMING";
        const eta = name === "FIRST_DRAFT_DELIVERY" && pr.firstDraftAt ? at(pr.firstDraftAt) : name === "FINAL_DELIVERY" && pr.dueAt ? at(pr.dueAt) : null;
        return { projectId: id, name, order, status: st, etaAt: eta, startedAt: st !== "UPCOMING" ? created : null, completedAt: st === "COMPLETED" ? (draftOut && name === "FIRST_DRAFT_DELIVERY" ? draftOut : created) : null };
      }),
    });

    // Team.
    const team = teamOf(pr.team);
    if (team.length) {
      const t = await prisma.team.create({ data: { projectId: id, confirmed: true, confirmedAt: teamConfirmedAt, proposedByStaffId: teddy?.staffId ?? null } });
      for (const m of team) await prisma.teamMember.create({ data: { teamId: t.id, staffMemberId: m.staffId, roleOnProject: (ROLE[m.role] ?? ROLE.Designer).onProject, recommended: true, allocatedHours: 8 } });
    }

    // Brief: the studio's slots; quality computed by briefQuality.
    const b = (pr.brief ?? {}) as Json & { task?: string | null; whyNow?: string; objective?: { goal: string; metric?: string; target?: string } | null; audience?: { personaId: string; barrier: string }; keyMessage?: string; proofOffer?: string; cta?: string; material?: string; quality?: number; conversation?: { author: string; at: string; text: string }[] };
    const markets = (pr.markets ?? []).map((m) => MARKET[m] ?? m);
    // The deadline: due or wanted-by date, or for delivered work the date it was delivered.
    const deadlineFrom = pr.dueAt ?? pr.wantedBy ?? pr.deliveredAt;
    const deadline = deadlineFrom ? day(deadlineFrom) : null;
    const formats = [...new Set((pr.assets ?? []).map((a) => FORMAT[a.size] ?? a.size))];
    const channels = [...new Set((pr.channels ?? []).map((c) => CHANNEL[c] ?? c))];
    const persona = b.audience ? brand.personas.find((x) => x.id === b.audience!.personaId) : null;
    const sec = (key: BriefSection["key"], value: string, extra: Partial<BriefSection> = {}): BriefSection => ({ key, value, source: "answer", editedByClient: true, ...extra });
    const sections: BriefSection[] = [
      ...(channels.length || formats.length ? [sec("deliverables", deliverablesText({ channels, formats, ideasCount: null }), { data: { channels, formats, ideasCount: null } })] : []),
      ...(b.whyNow ? [sec("whyNow", b.whyNow, { data: { reason: b.whyNow } })] : []),
      ...(b.objective ? [sec("objective", [b.objective.goal, b.objective.metric && `measured by ${b.objective.metric}`, b.objective.target && `target: ${b.objective.target}`].filter(Boolean).join(", "), { data: { goal: b.objective.goal, metric: b.objective.metric ?? null, target: b.objective.target ?? null, compareToProjectId: null, compareToName: null } })] : []),
      ...(persona ? [sec("audience", `${persona.name}, ${persona.summary} Holds them back: ${b.audience!.barrier}`, { source: "brandOS", sourceRef: { id: persona.id, name: persona.name }, data: { personaId: persona.id, personaName: persona.name, description: persona.summary, barrier: b.audience!.barrier } })] : []),
      ...(b.keyMessage ? [sec("keyMessage", b.keyMessage, { data: { text: b.keyMessage } })] : []),
      ...(b.proofOffer ? [sec("proofOffer", b.proofOffer, { data: { text: b.proofOffer, needsLegalLine: true } })] : []),
      ...(b.cta ? [sec("cta", b.cta, { data: { action: b.cta, destination: null } })] : []),
      ...(b.material ? [sec("material", b.material, { data: { clientProvides: null, klingitMakes: b.material, needsShoot: /shoot|photo/i.test(b.material) } })] : []),
      ...(deadline ? [sec("deadline", deadline, { data: { iso: deadline } })] : []),
      ...(b.reference ? [sec("references", String(b.reference), { refs: [{ kind: "file", label: String(b.reference).split("/").pop()! }] })] : []),
      ...(markets.length ? [sec("markets", markets.join(", "), { items: markets })] : []),
      ...(markets.length && status !== "DRAFT" ? [sec("languages", (pr.markets ?? []).map((m) => LANGUAGE[m]).join(", "), { items: (pr.markets ?? []).map((m) => LANGUAGE[m]) })] : []),
      sec("tone", brand.voice.toneRules.slice(0, 2).join("; "), { source: "brandOS", editedByClient: false }),
      ...(b.task ? [sec("task", b.task, { source: "suggested", editedByClient: false, data: { sentence: b.task, meta: "" } })] : []),
    ];
    const q = briefQuality({ sections, brand: brandFacts });
    if (typeof b.quality === "number") check(`Brief quality · ${pr.title}`, q.score, b.quality);
    const messages: StudioMessage[] = (b.conversation ?? []).map((m, i) => ({ id: `m${i}`, role: m.author === "agent" ? "agent" : "client", text: m.text, at: at(m.at).toISOString(), authorName: m.author === "agent" ? undefined : account.clientUsers.find((u) => u.id === m.author)?.name }));
    const log: StudioQuestion[] = status === "DRAFT"
      ? [{ id: "q-channels", key: "deliverables", part: "channels", question: "Where will this run?", type: "multi", options: ["Meta", "TikTok", "LinkedIn", "Snapchat"].map((l) => ({ id: l.toLowerCase(), label: l, group: "Social" })).concat(["Search & display", "YouTube / CTV"].map((l) => ({ id: l.toLowerCase().replace(/\W+/g, "-"), label: l, group: "Other digital" })), ["Print", "Out-of-home", "In-store"].map((l) => ({ id: l.toLowerCase().replace(/\W+/g, "-"), label: l, group: "Offline" }))), recommendedOptionIds: ["meta", "tiktok"], reasonPerOption: { tiktok: "Best ROAS in Summer (3.1)" }, askedAt: messages[messages.length - 1]?.at ?? now.toISOString() }]
      : [];
    if (status === "DRAFT" && messages.length) messages[messages.length - 1].questionId = "q-channels";
    const agentBuild: AgentBuild | null = pr.kind === "agent_build"
      ? (() => {
          const stages = (pr.stages as { name: BuildStep; date: string; done?: boolean }[]) ?? [];
          const spec = pr.spec as AgentBuild["spec"];
          const test = pr.testOutput as { title: string; text: string; quality: number } | undefined;
          return {
            step: (stages.find((s) => s.date === "now")?.name ?? "Building") as BuildStep,
            dates: Object.fromEntries(stages.map((s) => [s.name, s.date === "now" ? now.toISOString().slice(0, 10) : day(s.date)])),
            spec,
            testOutput: test ? { title: test.title, text: test.text, quality: test.quality, at: at("2026-10-02").toISOString() } : null,
            buildCredits: pr.credits.buildCost ?? null,
            perRunCredits: pr.credits.perRunEstimate ?? null,
          };
        })()
      : null;
    await prisma.brief.create({
      data: {
        projectId: id,
        submittedByUserId: maja.clientUserId,
        status: status === "DRAFT" ? "DRAFT" : "ACCEPTED",
        submittedAt: status === "DRAFT" ? null : created,
        acceptedAt: status === "DRAFT" ? null : created,
        rawIntake: b.task ?? (b.conversation?.[0]?.text as string | undefined) ?? (agentBuild ? agentBuild.spec.whatItDoes : pr.title),
        goals: b.objective?.goal ?? null,
        keyMessage: b.keyMessage ?? null,
        sections: sections as unknown as Prisma.InputJsonValue,
        messages: messages as unknown as Prisma.InputJsonValue,
        questionsLog: log as unknown as Prisma.InputJsonValue,
        agentDrafts: (agentBuild ? { agentBuild } : {}) as unknown as Prisma.InputJsonValue,
        qualityScore: q.score,
        createdAt: created,
      },
    });

    // Estimate: the pack's lines as custom lines (the Price List is global, so it isn't touched).
    if (pr.estimate) {
      const e = pr.estimate;
      const sent = e.status === "waiting_for_client_approval";
      const est = await prisma.estimate.create({
        data: {
          projectId: id,
          status: sent ? "SENT" : "APPROVED",
          totalCredits: e.total,
          totalHours: e.total * 2,
          currency: "SEK",
          sentAt: sent ? at(e.sentAt!) : approvedAt ?? created,
          expiresAt: sent ? new Date(at(e.sentAt!).getTime() + 4 * DAY) : null,
          respondedAt: sent ? null : approvedAt,
          approvedVersion: sent ? null : 1,
          sentByStaffId: teddy?.staffId ?? null,
          createdAt: created,
        },
      });
      await prisma.estimateLineItem.createMany({
        data: e.lines.map((l, i) => ({ estimateId: est.id, deliverable: l.deliverable, detail: l.qty ? `× ${l.qty}` : "", quantity: l.qty ?? 1, credits: l.credits, hours: l.credits * 2, order: i, isCustom: true, customReason: "ouhers demo price list (placeholder)" })),
      });
    }

    // Assets and versions. One asset per concept × size (× frame); each file is a version.
    const groups = new Map<string, NonNullable<PackProject["assets"]>>();
    for (const a of pr.assets ?? []) {
      const key = `${a.concept}|${a.size}|${a.frame ?? ""}|${a.slide ?? ""}`;
      groups.set(key, [...(groups.get(key) ?? []), a]);
    }
    const delivered = status === "DELIVERED" || status === "ARCHIVED";
    const approvedConcepts = new Set((pr.approvals ?? []).filter((x) => x.scope === "concept").map((x) => x.concept));
    const allApproved = (pr.approvals ?? []).some((x) => x.scope === "all");
    for (const [, files] of groups) {
      const first = files[0];
      const sorted = [...files].sort((a, b) => a.version - b.version);
      const latest = sorted[sorted.length - 1];
      const visible = latest.clientVisible;
      const approved = delivered || allApproved || approvedConcepts.has(first.concept);
      const assetStatus: AssetStatus = delivered ? "DELIVERED" : approved ? "APPROVED" : "IN_REVIEW";
      const format = first.frame ? `Storyboard 9:16 · frame ${first.frame}` : first.slide ? `Carousel ${first.size.replace("x", ":")} · slide ${first.slide}` : (FORMAT[first.size] ?? first.size);
      const asset = await prisma.asset.create({
        data: {
          projectId: id,
          clientId: OUHERS_CLIENT_ID,
          name: first.frame ? `${first.concept} ${first.frame}` : first.slide ? `${first.concept}, slide ${first.slide}` : first.concept,
          format,
          platform: channels.find((c) => c !== "Web") ?? null,
          type: "IMAGE",
          status: assetStatus,
          version: latest.version,
          sentVersion: visible ? latest.version : null,
          uploadedByUserId: team[0]?.userId ?? null,
          tags: { files: sorted.map((x) => x.file), concept: first.concept, size: first.size },
          createdAt: created,
        },
      });
      for (const f of sorted) {
        const saved = await store(f.file);
        const dims = manifest.find((m) => m.file === f.file);
        const sentInfo = pr.versions?.find((v) => v.n === f.version);
        const isLatest = f === latest;
        const state: AssetVersionState = !f.clientVisible ? "QC_READY" : !isLatest ? "CHANGES_REQUESTED" : approved ? "APPROVED" : "SENT_TO_CLIENT";
        const checks = specChecks({ format, platform: channels[0] ?? null, mimeType: saved.mimeType, sizeBytes: saved.sizeBytes, width: dims?.width ?? null, height: dims?.height ?? null });
        checkTotals = { passed: checkTotals.passed + checks.filter((c) => c.passed).length, total: checkTotals.total + checks.length };
        const v = await prisma.assetVersion.create({
          data: {
            assetId: asset.id,
            projectId: id,
            number: f.version,
            state,
            storageKey: saved.storageKey,
            mimeType: saved.mimeType,
            sizeBytes: saved.sizeBytes,
            width: dims?.width ?? null,
            height: dims?.height ?? null,
            uploadedByUserId: team[0]?.userId ?? null,
            checks: checks.map(({ key, label, source, passed }) => ({ key, label, source, passed })),
            checkedAt: sentInfo ? at(sentInfo.sentToClient) : now,
            sentAt: f.clientVisible && sentInfo ? at(sentInfo.sentToClient) : null,
            sentByUserId: f.clientVisible ? (teddy?.userId ?? null) : null,
            createdAt: sentInfo ? at(sentInfo.sentToClient) : now,
          },
        });
        // Anything the check flags on work that's still internal is a real flag for the quality check.
        if (!f.clientVisible) for (const c of checks.filter((c) => !c.passed && c.flag)) await prisma.qcFlag.create({ data: { versionId: v.id, projectId: id, checkKey: c.key, label: c.flag!.label, detail: c.flag!.detail, source: c.source } });
        fileVersion.set(f.file, v.id);
        fileAsset.set(f.file, asset.id);
        if (isLatest) {
          await prisma.asset.update({ where: { id: asset.id }, data: { storageKey: saved.storageKey, mimeType: saved.mimeType, sizeBytes: saved.sizeBytes, fileUrl: `/api/assets/${asset.id}/download?inline=1` } });
        }
      }
    }
    // QC flags the pack says were fixed before sending: on the version that was sent, as sent back to the designer and fixed.
    for (const v of pr.versions ?? []) {
      for (const f of v.qc.flags ?? []) {
        const file = (pr.assets ?? []).find((a) => a.file.includes(f.asset) && a.version === v.n)?.file;
        const versionId = file ? fileVersion.get(file) : undefined;
        if (!versionId) continue;
        await prisma.qcFlag.create({ data: { versionId, projectId: id, checkKey: f.check === "Size check" ? "size" : "safe_zone", label: f.text, detail: f.text, source: f.check, status: "SENT_TO_DESIGNER", resolvedByUserId: teddy?.userId ?? null, resolvedAt: at(v.sentToClient) } });
      }
      if (v.changes?.length) await prisma.comment.create({ data: { projectId: id, kind: "SYSTEM", body: `Version ${v.n} sent · ${v.changes.join(" · ")}`, createdAt: at(v.sentToClient) } });
      else await prisma.comment.create({ data: { projectId: id, kind: "SYSTEM", body: `Version ${v.n} sent · quality checked by Klingit`, createdAt: at(v.sentToClient) } });
    }

    // Copy table (p04): one COPY asset per element, its languages, status and suggestion in tags.
    for (const [i, row] of (pr.copy?.elements ?? []).entries()) {
      await prisma.asset.create({
        data: {
          projectId: id,
          clientId: OUHERS_CLIENT_ID,
          name: row.element,
          format: "Copy · SV NO DA",
          type: "COPY",
          status: row.status === "approved" || row.status === "locked" ? "APPROVED" : "IN_REVIEW",
          version: 2,
          sentVersion: 2,
          tags: { copy: { sv: row.sv, no: row.no, da: row.da }, status: row.status, suggestion: row.suggestion ? { ...row.suggestion, by: account.clientUsers.find((u) => u.id === row.suggestion!.by)?.name ?? row.suggestion.by } : null, order: i },
          createdAt: created,
        },
      });
    }

    // Comments: pins (x/y 0–1 → %), regions and the whole-set thread, all in the With Klingit channel.
    for (const c of pr.comments ?? []) {
      const assetId = c.asset ? fileAsset.get(c.asset) ?? null : null;
      for (const [i, m] of c.thread.entries()) {
        // The pack has no messages in the client's internal channel (only src/lib/internal-messages.ts may write it).
        await prisma.comment.create({
          data: {
            projectId: id,
            assetId,
            ...authorOf(m.author),
            body: m.text,
            resolved: Boolean(c.resolved),
            xPercent: i === 0 && c.x != null ? c.x * 100 : null,
            yPercent: i === 0 && c.y != null ? c.y * 100 : null,
            widthPercent: i === 0 && c.region ? c.region.w * 100 : null,
            heightPercent: i === 0 && c.region ? c.region.h * 100 : null,
            createdAt: at(m.at),
          },
        });
      }
    }
    // Approvals: who approved, in the decision log.
    for (const a of pr.approvals ?? []) {
      await prisma.decisionLog.create({ data: { projectId: id, actorUserId: userOf(a.by), area: "assets", action: a.scope === "concept" ? `Approved the concept "${a.concept}" and its sizes` : "Approved every asset", createdAt: at(a.at) } });
    }
    // p06 creator status, p01 delivery package, p11 build log: project events.
    for (const c of (pr.creators as { handle: string; status: string }[] | undefined) ?? []) await prisma.comment.create({ data: { projectId: id, kind: "SYSTEM", body: `Creator ${c.handle}: ${c.status}`, createdAt: now } });
    if (pr.delivery) await prisma.comment.create({ data: { projectId: id, kind: "SYSTEM", body: `Delivered as ${(pr.delivery as { package: string }).package}`, createdAt: at(pr.deliveredAt!) } });
    for (const l of (pr.log as { at: string; text: string }[] | undefined) ?? []) await prisma.comment.create({ data: { projectId: id, kind: "SYSTEM", body: l.text, createdAt: at(l.at) } });
    for (const m of (pr.conversation as { author: string; at: string; text: string }[] | undefined) ?? []) await prisma.comment.create({ data: { projectId: id, ...authorOf(m.author), body: m.text, createdAt: at(m.at) } });
  }
  say(`${projects.length} projects · ${fileVersion.size} files as versions`);
  check("Brand OS check on the seeded files (platform specs)", `${checkTotals.passed}/${checkTotals.total} passed`, "pack: 22–24 of 24 per sent version (with the AI pass)");

  // ─── Insights: as if from the Meta and TikTok connections (demo) ─────────
  const ins = read<Json & {
    campaigns: { id: string; name: string; platform: string; totals: { ctr: number; roas: number } }[];
    daily: { date: string; campaign: string; platform: string; spend: number; impressions: number; clicks: number; purchases: number }[];
    creativePerformance: { file: string; ctr: number }[];
    creativeAverageCtr: number;
    ctrByFormat: Record<string, number>;
    fatigue: { campaign: string; before: number; now: number }[];
    takeaways: { tag: string; metric: string; headline: string; action: { label: string; type: string }; why: string }[];
    whatToDo: { text: string; chip: string }[];
    market: { signals: { date: string; type: string; title: string; relevance: string; source?: string; before?: number; now?: number }[]; competitors: { name: string; newAds30d: Record<string, number>; positioning: string }[]; categoryBenchmark: { ctr: number; note: string }; trends: { theme: string; headlines: number; relevance: string }[]; ideas: { title: string; why: string; evidence: string[]; credits: [number, number] }[] };
    asOf: string;
  }>("insights.json");
  const campaign = new Map(ins.campaigns.map((c) => [c.id, c]));
  await prisma.adDailyMetric.createMany({
    data: ins.daily.map((d) => ({ clientId: OUHERS_CLIENT_ID, platform: d.platform === "tiktok" ? "TikTok" : "Meta", accountName: d.platform === "tiktok" ? "ouhers tiktok (demo)" : "ouhers ads (demo)", currency: "SEK", campaignId: d.campaign, campaignName: campaign.get(d.campaign)?.name ?? d.campaign, date: day(d.date), impressions: d.impressions, clicks: d.clicks, spend: d.spend, conversions: d.purchases })),
  });
  for (const c of ins.creativePerformance) {
    const assetId = fileAsset.get(c.file);
    if (assetId) await prisma.asset.update({ where: { id: assetId }, data: { performanceCtr: c.ctr } });
  }
  const measured = await prisma.asset.findMany({ where: { clientId: OUHERS_CLIENT_ID, performanceCtr: { not: null }, sentVersion: { not: null } }, select: { performanceCtr: true } });
  check("Creative average CTR", (Math.round((measured.reduce((a, m) => a + m.performanceCtr!, 0) / measured.length) * 100) / 100).toFixed(2), ins.creativeAverageCtr.toFixed(2));
  say(`Insights · ${ins.daily.length} daily rows, ${ins.creativePerformance.length} measured creatives`);

  const fmt = ins.ctrByFormat;
  const meta = campaign.get("cmp-sunday-meta")!.totals;
  const tiktok = campaign.get("cmp-sunday-tiktok")!.totals;
  const fatigue = ins.fatigue[0];
  const compareFor = (tag: string) =>
    tag === "Creative"
      ? [{ label: "9:16", value: fmt["9x16"], display: `${fmt["9x16"]}%` }, { label: "1.91:1", value: fmt["191x1"], display: `${fmt["191x1"]}%` }]
      : tag === "Fatigue"
        ? [{ label: "First 14 days", value: fatigue.before, display: `${fatigue.before}%` }, { label: "Last 7 days", value: fatigue.now, display: `${fatigue.now}%` }]
        : [{ label: "TikTok ROAS", value: tiktok.roas, display: String(tiktok.roas) }, { label: "Meta ROAS", value: meta.roas, display: String(meta.roas) }];
  const takeaways = ins.takeaways.map((t) => ({
    tag: t.tag === "Channel" ? "Performance" : t.tag,
    metric: t.metric,
    headline: t.headline,
    compare: compareFor(t.tag),
    action: t.action.type === "brief" ? { kind: "brief", label: t.action.label, view: null } : { kind: "view", label: t.action.label, view: "performance" },
    why: t.why,
  }));
  const actionWhy = [
    `The seaside 9:16 from Summer runs at the best CTR of any delivered creative; the always-on set is at ${campaign.get("cmp-alwayson")!.totals.ctr}%.`,
    `Always-on CTR went from ${fatigue.before}% in its first 14 days to ${fatigue.now}% in the last 7: the creative is tiring before the Black Friday push.`,
    `Summer on TikTok returned ROAS ${tiktok.roas} against ${meta.roas} on Meta, and dew drop's audience discovers on TikTok.`,
  ];
  await prisma.performanceBrief.create({
    data: {
      clientId: OUHERS_CLIENT_ID,
      summary: "TikTok is the most efficient channel; always-on Meta creative is tiring ahead of Black Friday.",
      takeaways,
      actions: ins.whatToDo.map((w, i) => ({ headline: w.text, chip: w.chip, why: actionWhy[i] ?? w.text, brief: w.text })),
      recommendations: ins.whatToDo.map((w, i) => ({ title: w.text, detail: actionWhy[i] ?? "" })),
      generatedAt: at(ins.asOf),
    },
  });
  const perfAgent = await agentId("performance_agent");
  if (perfAgent) await prisma.agentRun.create({ data: { agentId: perfAgent, clientId: OUHERS_CLIENT_ID, output: { takeaways }, decision: `${takeaways.length} takeaway(s), ${ins.whatToDo.length} action(s)`, createdAt: at(ins.asOf) } });

  // Market: signals, competitors (ad snapshots so new-ad counts are computed), benchmark, trends, ideas.
  const SIGNAL: Record<string, string> = { competitor: "COMPETITOR", trend: "TREND", your_ads: "PERFORMANCE" };
  for (const s of ins.market.signals) {
    const platform = s.title.match(/TikTok|Meta|Google/)?.[0] ?? null;
    await prisma.marketSignal.create({
      data: {
        clientId: OUHERS_CLIENT_ID,
        type: SIGNAL[s.type] ?? "MARKET",
        title: s.title,
        summary: s.before != null ? `Meta: ${s.before}% → ${s.now}% CTR.` : s.source ? `Covered by ${s.source}.` : "Spotted in the ad libraries (demo).",
        source: s.source ?? platform ?? (s.type === "your_ads" ? "Meta" : null),
        relevance: s.relevance === "high" ? "High relevance" : "Relevant",
        data: s.before != null ? { before: s.before, after: s.now } : undefined,
        publishedAt: at(s.date),
      },
    });
  }
  const PLATFORM: Record<string, string> = { meta: "Meta", tiktok: "TikTok", google: "Google" };
  for (const c of ins.market.competitors) {
    await prisma.competitorProfile.updateMany({ where: { clientId: OUHERS_CLIENT_ID, brand: c.name }, data: { positioning: c.positioning } });
    for (const [plat, n] of Object.entries(c.newAds30d)) {
      const base = Array.from({ length: 3 }, (_, i) => `${c.name}-${plat}-old-${i}`);
      const fresh = Array.from({ length: n }, (_, i) => `${c.name}-${plat}-new-${i}`);
      await prisma.competitorSnapshot.create({ data: { clientId: OUHERS_CLIENT_ID, brand: c.name, platform: PLATFORM[plat], adIds: base, capturedAt: new Date(now.getTime() - 40 * DAY) } });
      await prisma.competitorSnapshot.create({ data: { clientId: OUHERS_CLIENT_ID, brand: c.name, platform: PLATFORM[plat], adIds: [...base, ...fresh], capturedAt: new Date(now.getTime() - 2 * DAY) } });
    }
  }
  await prisma.performanceBenchmark.create({ data: { clientId: OUHERS_CLIENT_ID, ownFormat: "All delivered creative", ownCtr: ins.creativeAverageCtr, estimatedLow: ins.market.categoryBenchmark.ctr, estimatedHigh: ins.market.categoryBenchmark.ctr, rationale: ins.market.categoryBenchmark.note, generatedAt: at(ins.asOf) } });
  const trendSignals = ins.market.signals.filter((s) => s.type === "trend");
  await prisma.trendBrief.create({
    data: {
      clientId: OUHERS_CLIENT_ID,
      takeaway: "Skin minimalism and men's skincare are the themes to watch; refillable packaging is a holiday talking point.",
      themes: ins.market.trends.map((t) => {
        const own = trendSignals.filter((s) => s.title.toLowerCase().includes(t.theme.split(" ")[0].toLowerCase().replace(/'s$/, ""))).map((s) => s.title);
        const titles = [...own, ...Array.from({ length: Math.max(0, t.headlines - own.length) }, (_, i) => `${t.theme}: coverage ${i + 1} (demo)`)].slice(0, t.headlines);
        return { theme: t.theme, articleTitles: titles, relevance: t.relevance === "high" ? "High" : t.relevance === "medium" ? "Medium" : "Low" };
      }),
      generatedAt: at(ins.asOf),
    },
  });
  const IDEA_FORMATS: Record<string, string[]> = { "cloud cream for him": ["Stories 9:16", "Feed 1:1"], "Refill pouch teaser": ["Stories 9:16"], "Creator duets for dew drop": ["TikTok in-feed", "Reels 9:16"] };
  for (const idea of ins.market.ideas) {
    const formats = IDEA_FORMATS[idea.title] ?? ["Stories 9:16"];
    const est = estimatePreview({ formats, ideasCount: 1 }, prices);
    check(`Idea credit estimate · ${idea.title}`, est ? `${est.low}–${est.high}` : "unpriced", `${idea.credits[0]}–${idea.credits[1]}`);
    await prisma.marketIntelligenceIdea.create({
      data: {
        clientId: OUHERS_CLIENT_ID,
        title: idea.title,
        why: idea.why,
        detail: idea.why,
        evidence: idea.evidence.map((label) => ({ label })),
        chart: idea.title.startsWith("Creator") ? [{ label: "TikTok ROAS", value: tiktok.roas, display: String(tiktok.roas) }, { label: "Meta ROAS", value: meta.roas, display: String(meta.roas) }] : [],
        formats,
        createdAt: at(ins.asOf),
      },
    });
  }
  await prisma.marketIntelligenceBrief.create({
    data: {
      clientId: OUHERS_CLIENT_ID,
      summary: "Competitors are moving to creator ads on TikTok while your always-on Meta set tires.",
      assumptions: [],
      points: [
        { text: "Kind Ritual is moving to creator ads on TikTok, where your ROAS is already the best.", type: "competitor", actionLabel: "Brief creator duets" },
        { text: "Men's skincare grows fastest among 25–34: cloud cream for every face fits.", type: "trend", actionLabel: null },
      ],
      generatedAt: at(ins.asOf),
    },
  });

  // ─── Audience ────────────────────────────────────────────────────────────
  const aud = read<{ followersWeekly: { week: string; instagramK: number; tiktokK: number }[]; engagementByPostType: Record<string, number>; comments30d: number; engagementRate: number; sentiment: { positive: number; neutral: number; negative: number }; commentThemes: { theme: string; count: number }[]; funnel30d: { visitsFromAds: number; productPage: number; addToCart: number; checkout: number; purchase: number } }>("audience.json");
  await prisma.followerSnapshot.createMany({
    data: aud.followersWeekly.flatMap((w) => [
      { clientId: OUHERS_CLIENT_ID, platform: "Instagram", followerCount: Math.round(w.instagramK * 1000), capturedAt: at(w.week) },
      ...(w.tiktokK > 0 ? [{ clientId: OUHERS_CLIENT_ID, platform: "TikTok", followerCount: Math.round(w.tiktokK * 1000), capturedAt: at(w.week) }] : []),
    ]),
  });
  // Posts per type at the pack's engagement rates (two each, inside the last 30 days); engagement is computed from them.
  const POST_PLATFORM: Record<string, string> = { Reels: "Instagram", Carousel: "Instagram", Stories: "Instagram", "Single image": "Instagram" };
  let n = 0;
  for (const [type, rate] of Object.entries(aud.engagementByPostType)) {
    for (const k of [0, 1]) {
      n++;
      await prisma.contentPost.create({ data: { clientId: OUHERS_CLIENT_ID, platform: POST_PLATFORM[type] ?? "Instagram", channelType: "ORGANIC", contentType: type, title: `${type} · ${["dewy by default.", "skin, ours.", "cloud cream, whipped.", "you named it, we made it."][n % 4]}`, status: "PUBLISHED", publishedDate: new Date(now.getTime() - (3 + n * 3 + k) * DAY), engagementRate: rate, impressions: 12000 + n * 900, comments: 40 + n * 7 } });
    }
  }
  // Planned posts this month, for plan coverage (the pack: 9 planned against a minimum of 8).
  const cal = read<{ items: { date: string; title: string; kind: string; reason?: string }[]; planCoverage: { planned: number; sowMinimum: number } }>("calendar.json");
  const publishedThisMonth = await prisma.contentPost.count({ where: { clientId: OUHERS_CLIENT_ID, publishedDate: { gte: new Date(now.getFullYear(), now.getMonth(), 1) } } });
  for (let i = 0; i < Math.max(0, cal.planCoverage.planned - publishedThisMonth); i++) {
    await prisma.contentPost.create({ data: { clientId: OUHERS_CLIENT_ID, platform: i % 2 ? "TikTok" : "Instagram", channelType: "ORGANIC", contentType: i % 2 ? "Reels" : "Carousel", title: ["autumn routine, softer.", "milk wash, day 3.", "lip ours: your shades.", "sun day in october? yes."][i % 4], status: "PLANNED", scheduledDate: new Date(now.getTime() + (1 + i * 2) * DAY) } });
  }
  await prisma.contentPlanTarget.create({ data: { clientId: OUHERS_CLIENT_ID, platform: "Instagram", weeklyVolume: Math.round(cal.planCoverage.sowMinimum / 4) } });
  const engagement = Object.values(aud.engagementByPostType).reduce((a, b) => a + b, 0) / Object.keys(aud.engagementByPostType).length;
  check("Engagement rate (from posts)", engagement.toFixed(1), aud.engagementRate.toFixed(1));
  await prisma.communityManagementSnapshot.create({ data: { clientId: OUHERS_CLIENT_ID, periodStart: new Date(now.getTime() - 30 * DAY), periodEnd: now, commentVolume: aud.comments30d, dmVolume: 0, sentimentPositivePct: aud.sentiment.positive, sentimentNeutralPct: aud.sentiment.neutral, sentimentNegativePct: aud.sentiment.negative, themes: aud.commentThemes } });
  const f = aud.funnel30d;
  await prisma.websiteAnalyticsSnapshot.create({ data: { clientId: OUHERS_CLIENT_ID, periodStart: new Date(now.getTime() - 30 * DAY), periodEnd: now, visits: f.visitsFromAds, uniqueVisitors: Math.round(f.visitsFromAds * 0.82), conversions: f.purchase, conversionRate: Math.round((f.purchase / f.visitsFromAds) * 10000) / 100, funnel: f, topSource: "Meta ads" } });

  // ─── SEO & AI visibility ────────────────────────────────────────────────
  const seo = read<{ auditRun: string; pagesCrawled: number; seoHealth: number; pageSpeedMobileLcpSeconds: number; aiCrawlersAllowed: { allowed: number; total: number }; checks: { passed: number; warnings: number; errors: number }; topFixes: { text: string; impact: string }[]; aiVisibility: { assistants: string[]; questionsAsked: number; shareMentioned: Record<string, number>; sample: { q: string; mentioned: boolean[] }[] }; vsCompetitors: Record<string, number> }>("seo.json");
  const bots = ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended", "CCBot"];
  const onPage = (score: number) => ({ hasTitle: true, titleLength: 52, hasMetaDescription: true, metaDescriptionLength: 148, h1Count: 1, structuredDataTypes: score >= 80 ? ["Organization", "Product"] : ["Organization"], hasSitemap: true, aiCrawlerAccess: Object.fromEntries(bots.map((b, i) => [b, i < seo.aiCrawlersAllowed.allowed ? "allowed" : "blocked"])), pagesCrawled: seo.pagesCrawled, lcpSeconds: seo.pageSpeedMobileLcpSeconds });
  for (const [subject, score] of Object.entries(seo.vsCompetitors)) {
    const own = subject === "ouhers";
    await prisma.siteAudit.create({ data: { clientId: OUHERS_CLIENT_ID, subject: own ? "Own site" : subject, domain: own ? "ouhers.demo" : `${subject.split(" ")[0].toLowerCase()}.demo`, seoScore: score, onPageChecks: onPage(score), auditedAt: at(seo.auditRun) } });
  }
  await prisma.seoBrief.create({ data: { clientId: OUHERS_CLIENT_ID, summary: "Product schema and ingredient pages are the biggest gaps; AI assistants mention ouhers in 30% of buyer questions.", recommendations: seo.topFixes.map((x) => ({ title: x.text, impact: x.impact === "high" ? "High" : x.impact === "medium" ? "Medium" : "Low", detail: `${x.text} (from the site audit, ${seo.pagesCrawled} pages crawled).` })), generatedAt: at(seo.auditRun) } });
  // 20 buyer questions × 4 assistants, mentions set so the computed share of answers matches the pack.
  const ENGINE: Record<string, string> = { ChatGPT: "chatgpt", Claude: "claude", Gemini: "gemini", Perplexity: "perplexity" };
  const engines = seo.aiVisibility.assistants;
  const extraQ = ["moisturiser for oily skin nordics", "niacinamide serum under 400 kr", "best lip balm with tint", "skincare without fragrance", "hyaluronic serum for beginners", "gift set skincare christmas", "spf for daily use city", "gentle face wash for men", "vegan skincare brands sweden", "dewy skin routine", "affordable skincare brand scandinavia", "serum for dehydrated skin", "plume skin vs dewlab", "skincare brands with refills", "is kind ritual worth it"];
  const questions = [...seo.aiVisibility.sample.map((s) => s.q), ...extraQ].slice(0, seo.aiVisibility.questionsAsked);
  const rows = questions.length * engines.length;
  const target = Object.fromEntries(Object.entries(seo.aiVisibility.shareMentioned).map(([b, pct]) => [b, Math.round((pct / 100) * rows)]));
  const sampleHits = seo.aiVisibility.sample.flatMap((s) => s.mentioned).filter(Boolean).length;
  let ownLeft = target.ouhers - sampleHits;
  const brandsOrder = Object.keys(target);
  const counts: Record<string, number> = Object.fromEntries(brandsOrder.map((b) => [b, 0]));
  const visibility: Prisma.AiVisibilityCheckCreateManyInput[] = [];
  questions.forEach((q, qi) => {
    engines.forEach((e, ei) => {
      const idx = qi * engines.length + ei;
      const mentions = brandsOrder.map((b) => {
        let hit: boolean;
        if (b === "ouhers") hit = qi < seo.aiVisibility.sample.length ? seo.aiVisibility.sample[qi].mentioned[ei] : ownLeft > 0 && (idx * 7) % 3 === 0 && ownLeft-- > 0;
        else hit = counts[b] < target[b] && (idx * (b.length + 3)) % 5 < Math.ceil((target[b] / rows) * 5);
        if (hit) counts[b]++;
        return { brand: b, mentioned: hit };
      });
      visibility.push({ clientId: OUHERS_CLIENT_ID, engine: ENGINE[e] ?? e.toLowerCase(), grounded: true, question: q, answer: `(demo) ${mentions.filter((m) => m.mentioned).map((m) => m.brand).join(", ") || "no tracked brand"} mentioned.`, mentions, checkedAt: at(seo.auditRun) });
    });
  });
  await prisma.aiVisibilityCheck.createMany({ data: visibility });
  const ownShare = Math.round((visibility.filter((v) => (v.mentions as { brand: string; mentioned: boolean }[]).some((m) => m.brand === "ouhers" && m.mentioned)).length / rows) * 100);
  check("AI visibility · share of answers mentioning ouhers", `${ownShare}%`, `${seo.aiVisibility.shareMentioned.ouhers}%`);
  check("Site audit check counts", "computed by the SEO page from on-page checks", `${seo.checks.passed}/${seo.checks.warnings}/${seo.checks.errors}`);

  // ─── Calendar, reports, agents, notifications, the automated log ────────
  for (const item of cal.items) {
    if (item.kind === "client_plan") await prisma.clientCalendarItem.create({ data: { clientId: OUHERS_CLIENT_ID, title: item.title, date: at(item.date), channel: /email|newsletter/i.test(item.title) ? "Email" : /influencer/i.test(item.title) ? "Influencers" : "Launch" } });
    if (item.kind === "suggested") await prisma.contentPlanSuggestion.create({ data: { clientId: OUHERS_CLIENT_ID, title: item.title, rationale: item.reason ?? "", reason: item.reason ?? null, platform: "Instagram", status: "PENDING", stage: "SUBMITTED", sourceCadence: "Weekly trend scan", proposedDate: at(item.date) } });
  }
  const reports = read<{ weekly: { week: string; totals: { spend: number; ctr: number; roas: number; purchases: number } }[]; latest: { takeaways: string[]; topPosts: string[] }; schedule: Json }>("reports.json");
  for (const [i, w] of reports.weekly.entries()) {
    const period = periodFor("WEEKLY", at(w.week));
    const takeawaysW = i === 0 ? reports.latest.takeaways.map((t) => ({ title: t, detail: "" })) : [{ title: `SEK ${w.totals.spend.toLocaleString("en-GB")} spent, CTR ${w.totals.ctr}%, ROAS ${w.totals.roas}.`, detail: `${w.totals.purchases} purchases from ads.` }];
    await prisma.generatedReport.create({ data: { clientId: OUHERS_CLIENT_ID, kind: "WEEKLY", periodStart: period.start, periodEnd: period.end, label: period.label, takeaways: takeawaysW, topAssetIds: i === 0 ? reports.latest.topPosts.map((f) => fileAsset.get(f)).filter((x): x is string => Boolean(x)) : [], generatedAt: new Date(period.end.getTime() + DAY) } });
  }
  await prisma.clientReportingConfig.create({ data: { clientId: OUHERS_CLIENT_ID, cadence: "WEEKLY", sendDay: 1, sendTime: "08:00", recipientUserIds: [maja.userId, clientUserIds.get("ou-oscar")!.userId] } });

  const agents = read<{ readyToUse: { name: string; usage: string }[]; yourAgents: { name: string; status: string; meta: string; what: string }[]; templates: { name: string; format: string; uses: number }[] }>("agents.json");
  const SELF: Record<string, string> = { "Ad gen": "ad_gen", "Brief generator": "brief_generator_agent", "Email copy": "email_copy_agent", "Image gen": "image_gen_agent", "Instagram caption": "instagram_caption_agent", "Landing page copy": "landing_page_copy_agent", "LinkedIn post": "linkedin_post_agent" };
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  for (const a of agents.readyToUse) {
    const aid = await agentId(SELF[a.name]);
    const times = Number(a.usage.match(/(\d+)×/)?.[1] ?? 0);
    if (!aid || !times) continue;
    const thisMonth = /this month/.test(a.usage);
    await prisma.agentRun.createMany({ data: Array.from({ length: times }, (_, i) => ({ agentId: aid, clientId: OUHERS_CLIENT_ID, requestedByUserId: i % 2 ? clientUserIds.get("ou-elin")!.userId : maja.userId, decision: `${a.name} run (demo)`, createdAt: new Date(thisMonth ? Math.min(now.getTime() - 3600000 * (i + 1), now.getTime()) : monthStart - (i + 2) * DAY) })) });
  }
  for (const a of agents.yourAgents) {
    const key = `demo_ouhers_${a.name.toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "")}`;
    const agent = await prisma.agent.upsert({ where: { key }, update: { name: a.name, description: a.what, status: a.status === "live" ? "LIVE" : "SANDBOX" }, create: { key, name: a.name, description: a.what, category: "PRODUCTION", status: a.status === "live" ? "LIVE" : "SANDBOX", selfService: false } });
    const runs = Number(a.meta.match(/Run (\d+)×/)?.[1] ?? (a.status === "live" ? 4 : 1));
    await prisma.agentRun.createMany({ data: Array.from({ length: runs }, (_, i) => ({ agentId: agent.id, clientId: OUHERS_CLIENT_ID, decision: `${a.name} run (demo)`, createdAt: new Date(now.getTime() - (a.status === "live" ? i + 1 : 55 + i) * DAY) })) });
  }
  for (const t of agents.templates) await prisma.template.create({ data: { clientId: OUHERS_CLIENT_ID, name: t.name, category: t.format, usageCount: t.uses, previewColor: "#F6CDB8" } });

  const notes = read<{ at: string; text: string; action?: string; project?: string; yourAction?: boolean }[]>("notifications.json");
  for (const x of notes) {
    await prisma.notification.create({ data: { userId: maja.userId, clientId: OUHERS_CLIENT_ID, projectId: x.project ? projectId(x.project) : null, type: x.yourAction ? "APPROVAL_NEEDED" : "SYSTEM", title: x.text, body: x.text, actionUrl: x.project ? `/projects/${projectId(x.project)}` : "/reports", actionLabel: x.action ?? (x.project ? "Open" : "Read"), createdAt: at(x.at) } });
  }
  const pm = read<{ autoLog: { at: string; agent: string; decision: string; project: string }[] }>("pm.json");
  const AGENT_KEY: Record<string, string> = { "QC agent": "brand_compliance", "Estimate agent": "estimate_agent", "Staffing agent": "staffing_agent", "Brief agent": "brief_agent" };
  for (const l of pm.autoLog) {
    const aid = await agentId(AGENT_KEY[l.agent]);
    const run = aid ? await prisma.agentRun.create({ data: { agentId: aid, clientId: OUHERS_CLIENT_ID, projectId: projectId(l.project), decision: l.decision, createdAt: at(l.at) } }) : null;
    await prisma.decisionLog.create({ data: { projectId: projectId(l.project), actorUserId: null, area: "autopilot", action: l.decision, agentRunId: run?.id ?? null, createdAt: at(l.at) } });
  }

  // Credits: the monthly allowance and what each month used.
  let balance = 0;
  for (const [month, used] of Object.entries(account.plan.creditsUsedByMonth)) {
    const start = at(`${month}-01`);
    balance += account.plan.monthlyCredits;
    await prisma.creditLedgerEntry.create({ data: { clientId: OUHERS_CLIENT_ID, type: "ALLOWANCE", amount: account.plan.monthlyCredits, balanceAfter: balance, note: "Monthly allowance (placeholder plan)", createdAt: start } });
    balance -= used;
    await prisma.creditLedgerEntry.create({ data: { clientId: OUHERS_CLIENT_ID, type: "CONSUMPTION", amount: -used, balanceAfter: balance, note: `Credits used in ${month}`, createdAt: new Date(start.getTime() + 20 * DAY) } });
  }

  // ─── Computed vs expected ───────────────────────────────────────────────
  const health = await loadBrandHealth(OUHERS_CLIENT_ID);
  const KEY: Record<string, string> = { platform: "platform", visual: "visualIdentity", voice: "voiceTone", sources: "sources", performance: "performanceData" };
  for (const d of health.dimensions) check(`Brand health · ${d.name}`, `${d.done}/${d.total}`, brand.health.expected[KEY[d.key]] ?? "—");
  say(`Brand health ${health.score} (${health.label})`);
  return report;
}

/** The date `n` business days before `d` (so that adding them lands on `d`). */
function businessDaysBefore(d: Date, n: number) {
  let out = new Date(d);
  let left = n;
  while (left > 0) {
    out = new Date(out.getTime() - DAY);
    if (out.getDay() !== 0 && out.getDay() !== 6) left--;
  }
  return out;
}

const agentIds = new Map<string, string | null>();
async function agentId(key: string | undefined) {
  if (!key) return null;
  if (!agentIds.has(key)) agentIds.set(key, (await prisma.agent.findUnique({ where: { key }, select: { id: true } }))?.id ?? null);
  return agentIds.get(key)!;
}
