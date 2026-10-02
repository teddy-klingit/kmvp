import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";
import { buildBrandContext } from "@/lib/ai/brand-context";
import { brandSourcesForAgents } from "@/lib/brand-sources-data";
import { projectVisibilityWhere } from "@/lib/project-visibility";
import { PIPELINE_STAGE_ORDER } from "@/lib/labels";
import { formatDay } from "@/lib/project-state";
import { postProjectEvent } from "@/lib/project-events";
import { logDecision } from "@/lib/decision-log";
import { enqueue } from "@/lib/active-slots";
import { runBriefUpdateAgent, runSmartStartAgent, type SmartStartResult } from "@/lib/ai/agents/brief-studio-agent";
import type { PortalViewer } from "@/lib/brief-intake";
import {
  getSection,
  mergeAgentSections,
  newId,
  sectionFilled,
  setClientSection,
  SECTION_LABEL,
  type BrandFacts,
  type BriefRef,
  type BriefSection,
  type SectionKey,
  type StudioMessage,
  type StudioQuestion,
} from "@/lib/brief-studio/model";
import { briefQuality, type BriefQuality } from "@/lib/brief-studio/quality";
import { briefTitle, parseRequest, parseMarkets, MARKETS, type ParsedRequest } from "@/lib/brief-studio/parse";
import { earliestDates, estimatePreview, formatForAsset, formatForLabel, fromIsoDay, isoDay, type PriceEntry } from "@/lib/brief-studio/formats";
import {
  activeQuestion,
  applyAnswer,
  buildQuestion,
  nextQuestionKey,
  questionsLeft,
  roundUp,
  type Answer,
  type FormatStat,
  type PlannerContext,
  type TopAsset,
} from "@/lib/brief-studio/planner";

/**
 * The Brief studio on the server. Not a "use server" module: everything here takes a viewer the caller resolved
 * (src/lib/actions/brief-studio-actions.ts), so nothing is callable with someone else's ids.
 */

// ─── Context: what the agent knows ─────────────────────────────────────────

type Persona = { name: string; description: string; ageRange?: string };

export type PastProject = { id: string; name: string; type: string; score: number; markets: string[]; measured: TopAsset[] };

export type StudioContext = {
  brandContext: string;
  brand: BrandFacts;
  personas: Persona[];
  usps: string[];
  tone: string | null;
  prices: PriceEntry[];
  formatStats: FormatStat[];
  pastProjects: PastProject[];
  pastProjectCount: number;
  teammates: { id: string; name: string }[];
};

const STOP = new Set(["need", "needs", "want", "with", "some", "make", "made", "please", "new", "our", "the", "for", "and", "that", "this", "from"]);
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9åäöæø]+/).filter((t) => t.length > 2 && !STOP.has(t)));

/**
 * The client's 3 most similar past projects the viewer can see, with their measured assets: same type first,
 * then the same channel and shared words, then the ones with performance data, newest first. Only ever this
 * client's projects.
 */
export async function similarPastProjects(clientId: string, viewerClientUserId: string, q: { text: string; parsed: ParsedRequest; excludeProjectId?: string }, limit = 3): Promise<PastProject[]> {
  const projects = await prisma.project.findMany({
    where: { clientId, status: { notIn: ["DRAFT"] }, ...(q.excludeProjectId ? { id: { not: q.excludeProjectId } } : {}), ...projectVisibilityWhere(viewerClientUserId) },
    include: { brief: { select: { rawIntake: true, goals: true, sections: true } }, assets: { select: { id: true, name: true, format: true, performanceCtr: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const want = tokens(q.text);
  const scored = projects.map((p) => {
    const text = `${p.name} ${p.brief?.rawIntake ?? ""} ${p.brief?.goals ?? ""}`;
    const have = tokens(text);
    let score = p.type === q.parsed.projectType ? 3 : 0;
    if (q.parsed.channel && new RegExp(q.parsed.channel, "i").test(text)) score += 2;
    for (const t of want) if (have.has(t)) score += 1;
    const measured = p.assets
      .filter((a) => a.performanceCtr !== null)
      .sort((a, b) => b.performanceCtr! - a.performanceCtr!)
      .map((a) => ({ id: a.id, name: a.name, format: a.format, ctr: a.performanceCtr!, projectId: p.id, projectName: p.name }));
    if (measured.length) score += 1;
    const markets = jsonArray<BriefSection>(p.brief?.sections).find((s) => s.key === "markets")?.items ?? [];
    return { id: p.id, name: p.name, type: p.type, score, markets, measured, createdAt: p.createdAt };
  });
  return scored
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .map((p) => ({ id: p.id, name: p.name, type: p.type, score: p.score, markets: p.markets, measured: p.measured }));
}

/** Latest measured CTR per format: the most recent project that measured that format, its best asset. */
async function formatStatsFor(clientId: string, viewerClientUserId: string): Promise<FormatStat[]> {
  const assets = await prisma.asset.findMany({
    where: { clientId, performanceCtr: { not: null }, project: projectVisibilityWhere(viewerClientUserId) },
    select: { format: true, performanceCtr: true, project: { select: { name: true, createdAt: true } } },
  });
  const best = new Map<string, { ctr: number; projectName: string; at: number }>();
  for (const a of assets) {
    const f = formatForAsset(a.format);
    if (!f) continue;
    const at = a.project.createdAt.getTime();
    const cur = best.get(f.id);
    if (!cur || at > cur.at || (at === cur.at && a.performanceCtr! > cur.ctr)) best.set(f.id, { ctr: a.performanceCtr!, projectName: a.project.name, at });
  }
  return [...best].map(([formatId, v]) => ({ formatId, ctr: v.ctr, projectName: v.projectName }));
}

function toneFrom(brandOS: { toneRules: unknown; voiceAttributes: unknown; imageryStyle: string | null; colorPalette: unknown } | null) {
  if (!brandOS) return null;
  const rules = jsonArray<string>(brandOS.toneRules);
  const voice = jsonArray<{ leftLabel: string; rightLabel: string; value: number }>(brandOS.voiceAttributes).map((v) => (v.value >= 50 ? v.rightLabel : v.leftLabel));
  const colours = jsonArray<{ name: string }>(brandOS.colorPalette).map((c) => c.name);
  const parts = [
    rules.length ? rules.slice(0, 3).join(". ") : voice.length ? `Voice: ${voice.slice(0, 4).join(", ")}` : null,
    brandOS.imageryStyle ? `Imagery: ${brandOS.imageryStyle}` : null,
    colours.length ? `Colours: ${colours.slice(0, 4).join(", ")}` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(". ").replace(/\.\./g, ".")}.` : null;
}

export async function loadStudioContext(viewer: PortalViewer, q: { text: string; parsed: ParsedRequest; excludeProjectId?: string }): Promise<StudioContext> {
  const clientId = viewer.clientId;
  const [brandOS, linked, linkedCount, prices, pastProjects, formatStats, pastProjectCount, team] = await Promise.all([
    prisma.brandOS.findUnique({ where: { clientId } }),
    brandSourcesForAgents(clientId),
    prisma.brandSource.count({ where: { clientId, archivedAt: null } }),
    prisma.priceListItem.findMany({ where: { archivedAt: null } }),
    similarPastProjects(clientId, viewer.id, q),
    formatStatsFor(clientId, viewer.id),
    prisma.project.count({ where: { clientId, status: { not: "DRAFT" }, ...(q.excludeProjectId ? { id: { not: q.excludeProjectId } } : {}), ...projectVisibilityWhere(viewer.id) } }),
    prisma.clientUser.findMany({ where: { clientId, id: { not: viewer.id }, user: { status: { not: "SUSPENDED" } } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const voice = jsonArray(brandOS?.voiceAttributes).length > 0 || jsonArray(brandOS?.toneRules).length > 0;
  const visual = Boolean(brandOS?.imageryStyle || brandOS?.illustrationStyle || jsonArray(brandOS?.colorPalette).length || brandOS?.approvedTypography);
  return {
    brandContext: buildBrandContext(viewer.client, brandOS, linked),
    brand: { voice, visual, linkedSources: linkedCount },
    personas: jsonArray<Persona>(brandOS?.audiencePersonas),
    usps: jsonArray<string>(brandOS?.usps),
    tone: toneFrom(brandOS),
    prices: prices.map((p) => ({ deliverableType: p.deliverableType, complexityTier: p.complexityTier, creditCost: p.creditCost, leadTimeDays: p.leadTimeDays })),
    formatStats,
    pastProjects,
    pastProjectCount,
    teammates: team.map((m) => ({ id: m.id, name: m.user.name })),
  };
}

// ─── State ─────────────────────────────────────────────────────────────────

export type StudioState = { sections: BriefSection[]; messages: StudioMessage[]; log: StudioQuestion[] };

function plannerContext(ctx: StudioContext, parsed: ParsedRequest, sections: BriefSection[], now: Date): PlannerContext {
  const items = getSection(sections, "deliverables")?.items ?? [];
  const topAssets = ctx.pastProjects.flatMap((p) => p.measured).sort((a, b) => b.ctr - a.ctr);
  const withMarkets = ctx.pastProjects.find((p) => p.markets.length);
  return {
    kind: parsed.kind,
    formatStats: ctx.formatStats,
    usps: ctx.usps,
    topAssets: topAssets.filter((a, i) => topAssets.findIndex((x) => x.id === a.id) === i),
    pastMarkets: withMarkets ? { markets: withMarkets.markets, projectName: withMarkets.name } : null,
    estimate: estimatePreview(items, ctx.prices),
    earliest: earliestDates(items, ctx.prices, now),
  };
}

const isDefault = (s: BriefSection | undefined) => !sectionFilled(s) || (s!.source === "suggested" && !s!.editedByClient && !s!.delegated);

/** The Basics defaults follow the formats until the client sets them: the earliest realistic deadline, a budget that covers the preview. */
function refreshDefaults(sections: BriefSection[], ctx: StudioContext, now: Date) {
  const items = getSection(sections, "deliverables")?.items ?? [];
  let out = sections;
  if (isDefault(getSection(out, "deadline"))) {
    out = [...out.filter((s) => s.key !== "deadline"), { key: "deadline", value: isoDay(earliestDates(items, ctx.prices, now).final), source: "suggested", editedByClient: false }];
  }
  if (isDefault(getSection(out, "budget"))) {
    const preview = estimatePreview(items, ctx.prices);
    out = out.filter((s) => s.key !== "budget");
    if (preview) out.push({ key: "budget", value: String(roundUp(preview.high)), source: "suggested", editedByClient: false });
  }
  return out;
}

const quality = (sections: BriefSection[], ctx: StudioContext) => briefQuality({ sections, brand: ctx.brand });

/** After any change: refresh the defaults, then let the agent ask its next question, or close the round. */
function advance(state: StudioState, ctx: StudioContext, parsed: ParsedRequest, now: Date): StudioState {
  const sections = refreshDefaults(state.sections, ctx, now);
  let { messages, log } = state;
  if (!activeQuestion(log)) {
    const q = quality(sections, ctx);
    const key = nextQuestionKey(sections, log, q.score);
    if (key) {
      const question = buildQuestion(key, plannerContext(ctx, parsed, sections, now), { now });
      log = [...log, question];
      messages = [...messages, { id: newId("m"), role: "agent", text: question.question, at: now.toISOString(), questionId: question.id }];
    } else if (log.some((x) => x.answeredAt) && !messages.some((m) => m.id.startsWith("wrap"))) {
      const text = q.score >= 80 ? "That's a great brief. Send it to Klingit when you're ready." : `That covers the essentials. Send it when you're ready, or make it great with the suggestions on the right.`;
      messages = [...messages, { id: newId("wrap"), role: "agent", text, at: now.toISOString() }];
    }
  }
  return { sections, messages, log };
}

// ─── Smart start ───────────────────────────────────────────────────────────

function pastProjectsText(ctx: StudioContext) {
  return ctx.pastProjects
    .map((p) => `- ${p.name} (${p.type})${p.markets.length ? `, markets: ${p.markets.join(", ")}` : ""}${p.measured.length ? `, measured: ${p.measured.slice(0, 3).map((a) => `${a.name} ${a.format} ${a.ctr}% CTR`).join("; ")}` : ""}`)
    .join("\n");
}

/** Pre-fills every section it can from the client's words, Brand OS and past projects, each tagged with its source. */
export function prefill(parsed: ParsedRequest, ai: SmartStartResult | null, ctx: StudioContext, now: Date): BriefSection[] {
  const answer = (key: SectionKey, v: Partial<BriefSection>): BriefSection => ({ key, value: "", ...v, source: "answer", editedByClient: false });
  const out: BriefSection[] = [];
  const x = ai?.extracted;

  // The client's own words.
  const objective = x?.objective || parsed.objective;
  if (objective) out.push(answer("objective", { value: ai?.suggestedObjective && parsed.objective ? ai.suggestedObjective : objective }));
  // The agent's reading only counts when it names a real format or market ("Meta ads" is neither).
  const formats = [...new Set([...parsed.formats, ...(x?.formats ?? []).flatMap((f) => (formatForLabel(f) ? [formatForLabel(f)!.label] : []))])];
  if (formats.length) out.push(answer("deliverables", { items: formats }));
  const markets = [...new Set([...parsed.markets, ...(x?.markets ?? []).flatMap((m) => (MARKETS.some((k) => k.name === m) ? [m] : parseMarkets(m)))])];
  if (markets.length) out.push(answer("markets", { items: markets }));
  const deadline = parsed.deadline ?? (x?.deadline ? fromIsoDay(x.deadline) : null);
  if (deadline) out.push(answer("deadline", { value: isoDay(deadline) }));
  if (parsed.budgetCredits) out.push(answer("budget", { value: String(parsed.budgetCredits) }));
  const message = parsed.keyMessage ?? x?.keyMessage;
  if (message) out.push(answer("keyMessage", { value: message }));
  const metric = parsed.successMetric ?? x?.successMetric;
  if (metric) out.push(answer("successMetric", { value: metric }));
  const must = [...new Set([...parsed.mustHaves, ...(x?.mustHaves ?? [])])];
  if (must.length) out.push(answer("mustHaves", { items: must }));

  // Brand OS: the persona and the brand's voice and look. Never asked when they're known.
  const persona = ctx.personas[0];
  if (persona) out.push({ key: "audience", value: `${persona.description}${persona.ageRange && !persona.description.includes(persona.ageRange) ? `, ${persona.ageRange}` : ""}`, source: "brandOS", sourceRef: { id: "persona", name: persona.name }, editedByClient: false });
  if (ctx.tone) out.push({ key: "tone", value: ctx.tone, source: "brandOS", editedByClient: false });

  // Past projects: markets used last time and the best-performing creative as references.
  const withMarkets = ctx.pastProjects.find((p) => p.markets.length);
  if (!markets.length && withMarkets) out.push({ key: "markets", value: "", items: withMarkets.markets, source: "pastProject", sourceRef: { id: withMarkets.id, name: withMarkets.name }, editedByClient: false });
  const refProject = ctx.pastProjects.find((p) => p.measured.length);
  if (refProject) {
    const refs: BriefRef[] = refProject.measured.slice(0, 2).map((a) => ({ kind: "asset", id: a.id, label: a.name, sub: `${a.ctr}% CTR · ${a.format.split(/\s/)[0]}` }));
    out.push({ key: "references", value: "", refs, source: "pastProject", sourceRef: { id: refProject.id, name: refProject.name }, editedByClient: false });
  }

  // The agent's suggestions: the best-measured format, a key message grounded in the brand.
  if (!formats.length) {
    const best = [...ctx.formatStats].sort((a, b) => b.ctr - a.ctr)[0];
    const label = best && formatForLabel(best.formatId === "stories" ? "Stories 9:16" : best.formatId)?.label;
    if (label && (parsed.kind === "ads" || parsed.kind === "social")) out.push({ key: "deliverables", value: "", items: [label], source: "suggested", editedByClient: false });
  }
  if (!message && ai?.suggestedKeyMessage) out.push({ key: "keyMessage", value: ai.suggestedKeyMessage, source: "suggested", editedByClient: false });

  return refreshDefaults(mergeAgentSections([], out), ctx, now);
}

const and = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}` : l[0] ?? "");

/** "I started your brief from your Brand OS and your last Meta campaign, **Summer social pack**. …" */
export function summaryLine(sections: BriefSection[], ctx: StudioContext, parsed: ParsedRequest, left: number) {
  const from: string[] = [];
  if (sections.some((s) => s.source === "brandOS")) from.push("your Brand OS");
  const past = sections.find((s) => s.source === "pastProject")?.sourceRef;
  if (past) from.push(`your last ${parsed.channel ? `${parsed.channel} ` : ""}${parsed.kind === "deck" ? "deck" : "campaign"}, **${past.name}**`);
  const filled = (["audience", "tone", "markets", "references", "keyMessage", "deliverables"] as SectionKey[])
    .filter((k) => sectionFilled(getSection(sections, k)) && getSection(sections, k)!.source !== "answer")
    .map((k) => (k === "tone" ? "tone and brand" : SECTION_LABEL[k].toLowerCase()));
  const said = sections.filter((s) => s.source === "answer" && s.key !== "budget").map((s) => SECTION_LABEL[s.key].toLowerCase());
  const start = from.length ? `I started your brief from ${and(from)}.` : said.length ? "I started your brief from what you wrote." : "I started your brief.";
  const parts = [start];
  if (filled.length) parts.push(`${capital(and(filled))} ${filled.length === 1 ? "is" : "are"} already filled in on the right.`);
  else if (said.length) parts.push(`${capital(and(said))} ${said.length === 1 ? "is" : "are"} in from your message.`);
  parts.push(left ? `About ${left} quick question${left === 1 ? "" : "s"} and you are done.` : "That covers the essentials. Send it when you're ready.");
  return parts.join(" ");
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Creates the project as a draft with its brief straight away (so it autosaves), then runs the smart start. */
export async function startStudio(viewer: PortalViewer, text: string, now = new Date()) {
  const parsed = parseRequest(text, now);
  const project = await prisma.project.create({
    data: { clientId: viewer.clientId, name: briefTitle({ kind: parsed.kind, channel: parsed.channel, objective: parsed.objective, markets: parsed.markets, text }), type: parsed.projectType, status: "DRAFT", createdByClientUserId: viewer.id },
  });
  await prisma.pipelineStage.createMany({ data: PIPELINE_STAGE_ORDER.map((name, order) => ({ projectId: project.id, name, order, status: order === 0 ? "ACTIVE" : "UPCOMING" })) });
  const brief = await prisma.brief.create({ data: { projectId: project.id, submittedByUserId: viewer.id, rawIntake: text, status: "DRAFT" } });
  const { state, ctx } = await smartStart(viewer, project.id, text, now);
  await persist(brief.id, project.id, state, ctx, parsed);
  return project.id;
}

/** The first message on a brief: pre-fill, the summary line, then the first question. */
async function smartStart(viewer: PortalViewer, projectId: string, text: string, now: Date) {
  const parsed = parseRequest(text, now);
  const ctx = await loadStudioContext(viewer, { text, parsed, excludeProjectId: projectId });
  const ai = await runSmartStartAgent({ clientId: viewer.clientId, projectId, text, brandContext: ctx.brandContext, pastProjects: pastProjectsText(ctx), today: isoDay(now) })
    .then((r) => (r.ok ? r.data : null))
    .catch(() => null);
  const sections = prefill(parsed, ai, ctx, now);
  const client: StudioMessage = { id: newId("m"), role: "client", text, at: now.toISOString(), authorName: viewer.user.name };
  const state = advance({ sections, messages: [client], log: [] }, ctx, parsed, now);
  // The summary goes before the first question.
  const left = questionsLeft(state.sections, state.log, quality(state.sections, ctx).score);
  const summary: StudioMessage = { id: newId("m"), role: "agent", text: summaryLine(state.sections, ctx, parsed, left), at: now.toISOString() };
  return { state: { ...state, messages: [client, summary, ...state.messages.slice(1)] }, ctx, parsed };
}

// ─── Loading and saving ────────────────────────────────────────────────────

/** The viewer's own draft brief (their client, visible to them, not yet sent). */
export async function loadDraft(viewer: PortalViewer, projectId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, clientId: viewer.clientId, ...projectVisibilityWhere(viewer.id) },
    include: { brief: true },
  });
  if (!project) return null;
  const brief = project.brief ?? (await prisma.brief.create({ data: { projectId, status: "DRAFT" } }));
  const editable = ["DRAFT", "BRIEFING"].includes(project.status) && (brief.status === "DRAFT" || brief.status === "GAPS_FLAGGED");
  return { project, brief, editable };
}

function stateOf(brief: { sections: unknown; messages: unknown; questionsLog: unknown }): StudioState {
  return { sections: jsonArray<BriefSection>(brief.sections), messages: jsonArray<StudioMessage>(brief.messages), log: jsonArray<StudioQuestion>(brief.questionsLog) };
}

const titleFor = (sections: BriefSection[], parsed: ParsedRequest) => {
  const objective = getSection(sections, "objective")?.value ?? null;
  const known = ["Drive app installs", "Drive sales", "Build awareness", "Drive sign-ups", "Win back lapsed users"].find((o) => objective?.startsWith(o)) ?? (objective ? parsed.objective : null);
  return briefTitle({ kind: parsed.kind, channel: parsed.channel, objective: known, markets: getSection(sections, "markets")?.items ?? [], text: parsed.raw });
};

async function persist(briefId: string, projectId: string, state: StudioState, ctx: StudioContext, parsed: ParsedRequest) {
  const q = quality(state.sections, ctx);
  const deadline = fromIsoDay(getSection(state.sections, "deadline")?.value ?? "");
  await prisma.brief.update({ where: { id: briefId }, data: { sections: state.sections, messages: state.messages, questionsLog: state.log, qualityScore: q.score } });
  await prisma.project.update({ where: { id: projectId }, data: { name: titleFor(state.sections, parsed), type: parsed.projectType, dueDate: deadline } });
}

// ─── The view the studio renders ───────────────────────────────────────────

export type StudioView = {
  projectId: string;
  title: string;
  editable: boolean;
  sections: BriefSection[];
  quality: BriefQuality;
  active: StudioQuestion | null;
  log: StudioQuestion[];
  messages: StudioMessage[];
  questionsLeft: number;
  estimate: { low: number; high: number } | null;
  basics: {
    deadline: { iso: string; label: string; earliestIso: string; earliestLabel: string; firstDraftLabel: string };
    markets: string[];
    marketOptions: string[];
    budget: string;
    budgetOptions: { value: string; label: string }[];
  };
  agentNote: string;
  teammates: { id: string; name: string }[];
  savedAt: string;
};

export function budgetLabel(v: string) {
  if (!v) return "Not set";
  if (v === "flexible") return "Flexible";
  return /^\d+$/.test(v) ? `Up to ${v} credits` : v;
}

export function buildView(projectId: string, editable: boolean, state: StudioState, ctx: StudioContext, parsed: ParsedRequest, now = new Date()): StudioView {
  const q = quality(state.sections, ctx);
  const items = getSection(state.sections, "deliverables")?.items ?? [];
  const estimate = estimatePreview(items, ctx.prices);
  const earliest = earliestDates(items, ctx.prices, now);
  const deadlineIso = getSection(state.sections, "deadline")?.value || isoDay(earliest.final);
  const markets = getSection(state.sections, "markets")?.items ?? [];
  const budget = getSection(state.sections, "budget")?.value ?? "";
  const caps = [...new Set([10, 20, 30, 50, 80, ...(estimate ? [roundUp(estimate.high)] : []), ...(/^\d+$/.test(budget) ? [Number(budget)] : [])])].sort((a, b) => a - b);
  const n = ctx.pastProjectCount;
  return {
    projectId,
    title: titleFor(state.sections, parsed),
    editable,
    sections: state.sections,
    quality: q,
    active: activeQuestion(state.log),
    log: state.log,
    messages: state.messages,
    questionsLeft: questionsLeft(state.sections, state.log, q.score),
    estimate,
    basics: {
      deadline: { iso: deadlineIso, label: formatDay(fromIsoDay(deadlineIso) ?? earliest.final), earliestIso: isoDay(earliest.final), earliestLabel: formatDay(earliest.final), firstDraftLabel: formatDay(earliest.firstDraft) },
      markets,
      marketOptions: [...new Set([...markets, ...MARKETS.map((m) => m.name)])],
      budget,
      budgetOptions: [...caps.map((c) => ({ value: String(c), label: `Up to ${c} credits` })), { value: "flexible", label: "Flexible" }],
    },
    agentNote: ctx.personas.length || ctx.tone ? `Knows your Brand OS and ${n} past project${n === 1 ? "" : "s"}` : `Knows ${n} of your past project${n === 1 ? "" : "s"}`,
    teammates: ctx.teammates,
    savedAt: now.toISOString(),
  };
}

async function contextFor(viewer: PortalViewer, projectId: string, rawIntake: string | null) {
  const text = rawIntake ?? "";
  const parsed = parseRequest(text);
  const ctx = await loadStudioContext(viewer, { text, parsed, excludeProjectId: projectId });
  return { parsed, ctx };
}

export async function studioView(viewer: PortalViewer, projectId: string) {
  const draft = await loadDraft(viewer, projectId);
  if (!draft) return null;
  const { parsed, ctx } = await contextFor(viewer, projectId, draft.brief.rawIntake);
  return buildView(projectId, draft.editable, stateOf(draft.brief), ctx, parsed);
}

/** Loads, applies one change, lets the agent move on, saves, and returns the new view. */
async function mutate(viewer: PortalViewer, projectId: string, change: (state: StudioState, env: { ctx: StudioContext; parsed: ParsedRequest; now: Date }) => StudioState | Promise<StudioState>) {
  const draft = await loadDraft(viewer, projectId);
  if (!draft || !draft.editable) return null;
  const now = new Date();
  const { parsed, ctx } = await contextFor(viewer, projectId, draft.brief.rawIntake);
  const changed = await change(stateOf(draft.brief), { ctx, parsed, now });
  const next = advance(changed, ctx, parsed, now);
  await persist(draft.brief.id, projectId, next, ctx, parsed);
  return buildView(projectId, true, next, ctx, parsed, now);
}

function markAnswered(log: StudioQuestion[], id: string, patch: Partial<StudioQuestion>) {
  return log.map((q) => (q.id === id ? { ...q, ...patch, answeredAt: new Date().toISOString() } : q));
}

export function answerQuestion(viewer: PortalViewer, projectId: string, questionId: string, answer: Answer) {
  return mutate(viewer, projectId, (state, { ctx, parsed, now }) => {
    const q = state.log.find((x) => x.id === questionId && !x.answeredAt);
    if (!q) return state;
    const sections = applyAnswer(state.sections, q, answer, plannerContext(ctx, parsed, state.sections, now));
    const log = markAnswered(state.log, q.id, { chosen: answer.chosen ?? [], freeText: answer.freeText || undefined, delegated: answer.delegate || undefined });
    const messages = answer.freeText
      ? [...state.messages, { id: newId("m"), role: "client" as const, text: answer.freeText, at: now.toISOString(), authorName: viewer.user.name }]
      : state.messages;
    return { sections, log, messages };
  });
}

/** The composer: answers the open question in the client's words, or goes to the brief agent. */
export async function sendMessage(viewer: PortalViewer, projectId: string, text: string) {
  const active = text.trim();
  if (!active) return studioView(viewer, projectId);
  // A brief nobody has started yet (say, a project Klingit opened for the client): this is its first message.
  const draft = await loadDraft(viewer, projectId);
  if (draft?.editable && jsonArray(draft.brief.messages).length === 0) {
    const now = new Date();
    // A draft from before the studio keeps what the client wrote then.
    const text = draft.brief.rawIntake && !draft.brief.rawIntake.includes(active) ? `${draft.brief.rawIntake}\n\n${active}` : active;
    await prisma.brief.update({ where: { id: draft.brief.id }, data: { rawIntake: text, submittedByUserId: draft.brief.submittedByUserId ?? viewer.id } });
    const { state, ctx, parsed } = await smartStart(viewer, projectId, text, now);
    const merged = { ...state, sections: mergeAgentSections(stateOf(draft.brief).sections, state.sections) };
    await persist(draft.brief.id, projectId, merged, ctx, parsed);
    return buildView(projectId, true, merged, ctx, parsed, now);
  }
  return mutate(viewer, projectId, async (state, { ctx, parsed, now }) => {
    const open = activeQuestion(state.log);
    const clientMsg: StudioMessage = { id: newId("m"), role: "client", text: active, at: now.toISOString(), authorName: viewer.user.name };
    if (open) {
      return {
        sections: applyAnswer(state.sections, open, { freeText: active }, plannerContext(ctx, parsed, state.sections, now)),
        log: markAnswered(state.log, open.id, { chosen: [], freeText: active }),
        messages: [...state.messages, clientMsg],
      };
    }
    const brief = state.sections.filter(sectionFilled).map((s) => `${SECTION_LABEL[s.key]}: ${s.value || (s.items ?? []).join(", ") || (s.refs ?? []).map((r) => r.label).join(", ")}`).join("\n");
    const result = await runBriefUpdateAgent({ clientId: viewer.clientId, projectId, text: active, brief, brandContext: ctx.brandContext }).catch(() => null);
    let sections = state.sections;
    let reply = "Noted. I've added that to the brief.";
    if (result?.ok) {
      reply = result.data.reply;
      // The client's own message: it lands as their answer, but never over something they edited themselves.
      for (const u of result.data.updates) {
        const current = getSection(sections, u.key);
        if (current?.editedByClient) continue;
        sections = setClientSection(sections, u.key, { value: u.value, items: u.items.length ? u.items : undefined });
      }
    } else {
      const notes = getSection(sections, "notes")?.value;
      sections = setClientSection(sections, "notes", { value: notes ? `${notes}\n${active}` : active });
    }
    return { sections, log: state.log, messages: [...state.messages, clientMsg, { id: newId("m"), role: "agent", text: reply, at: now.toISOString() }] };
  });
}

/** Inline edit on the canvas: the client's value, protected from the agent. Editing the asked section answers it. */
export function editSection(viewer: PortalViewer, projectId: string, key: SectionKey, patch: { value?: string; items?: string[] }) {
  return mutate(viewer, projectId, (state) => {
    const sections = setClientSection(state.sections, key, { value: patch.value ?? "", items: patch.items });
    const open = activeQuestion(state.log);
    const log = open?.key === key ? markAnswered(state.log, open.id, { chosen: [], freeText: patch.value ?? patch.items?.join(", ") }) : state.log;
    return { ...state, sections, log };
  });
}

export function setBasics(viewer: PortalViewer, projectId: string, basics: { deadline?: string; markets?: string[]; budget?: string }) {
  return mutate(viewer, projectId, (state) => {
    let sections = state.sections;
    if (basics.deadline && fromIsoDay(basics.deadline)) sections = setClientSection(sections, "deadline", { value: basics.deadline });
    if (basics.markets) sections = setClientSection(sections, "markets", { value: "", items: basics.markets });
    if (basics.budget !== undefined) sections = setClientSection(sections, "budget", { value: basics.budget });
    let log = state.log;
    const open = activeQuestion(log);
    if (open && ((basics.markets && open.key === "markets") || (basics.deadline && open.key === "deadline"))) log = markAnswered(log, open.id, { chosen: [] });
    return { ...state, sections, log };
  });
}

/** "Make it great" and "+ more?": ask about one section now. A question still open is set aside and comes back later. */
export function askAbout(viewer: PortalViewer, projectId: string, key: SectionKey) {
  return mutate(viewer, projectId, (state, { ctx, parsed, now }) => {
    const open = activeQuestion(state.log);
    if (open?.key === key) return state;
    const log = open ? state.log.filter((q) => q.id !== open.id) : state.log;
    const messages = open ? state.messages.filter((m) => m.questionId !== open.id) : state.messages;
    const question = buildQuestion(key, plannerContext(ctx, parsed, state.sections, now), { requested: true, now });
    return { sections: state.sections, log: [...log, question], messages: [...messages, { id: newId("m"), role: "agent", text: question.question, at: now.toISOString(), questionId: question.id }] };
  });
}

export function addReference(viewer: PortalViewer, projectId: string, ref: BriefRef) {
  return mutate(viewer, projectId, (state) => {
    const current = getSection(state.sections, "references");
    const refs = [...(current?.source === "answer" || current?.editedByClient ? current.refs ?? [] : current?.refs ?? []), ref];
    let log = state.log;
    const open = activeQuestion(log);
    if (open?.key === "references") log = markAnswered(log, open.id, { chosen: [], freeText: ref.label });
    return { ...state, sections: setClientSection(state.sections, "references", { value: current?.value === "None" ? "" : current?.value ?? "", refs }), log };
  });
}

export async function inviteTeammate(viewer: PortalViewer, projectId: string, clientUserId: string) {
  const draft = await loadDraft(viewer, projectId);
  if (!draft?.editable) return null;
  const mate = await prisma.clientUser.findFirst({ where: { id: clientUserId, clientId: viewer.clientId }, include: { user: true } });
  if (!mate) return null;
  // A member can see the draft even when it's confidential.
  await prisma.projectMember.upsert({
    where: { projectId_clientUserId: { projectId, clientUserId: mate.id } },
    update: {},
    create: { projectId, clientUserId: mate.id },
  });
  await prisma.notification.create({
    data: {
      userId: mate.userId,
      clientId: viewer.clientId,
      projectId,
      type: "SYSTEM",
      title: `${viewer.user.name} asked you to help with a brief`,
      body: `"${draft.project.name}": answer the open questions or edit any section.`,
      actionUrl: `/brief/${projectId}`,
      actionLabel: "Open brief",
    },
  });
  return mutate(viewer, projectId, (state, { now }) => ({
    ...state,
    messages: [...state.messages, { id: newId("m"), role: "agent", text: `${mate.user.name.split(" ")[0]} is invited and can answer here too.`, at: now.toISOString() }],
  }));
}

/**
 * Send brief to Klingit: never blocked by the score. Completes the brief, moves the project to estimating and
 * returns; the caller then runs autopilot (the Estimate agent) after the response.
 */
export async function sendBrief(viewer: PortalViewer, projectId: string) {
  const draft = await loadDraft(viewer, projectId);
  if (!draft || !draft.editable) return null;
  const { parsed, ctx } = await contextFor(viewer, projectId, draft.brief.rawIntake);
  const state = stateOf(draft.brief);
  const sections = refreshDefaults(state.sections, ctx, new Date());
  const q = quality(sections, ctx);
  const text = (k: SectionKey) => {
    const s = getSection(sections, k);
    if (!sectionFilled(s)) return null;
    return [s!.value, ...(s!.items ?? []), ...(s!.refs ?? []).map((r) => r.label)].filter(Boolean).join(", ");
  };
  const deadline = fromIsoDay(getSection(sections, "deadline")?.value ?? "");
  const now = new Date();

  // The legacy columns stay filled, so the Estimate agent and the brief record read the same brief.
  await prisma.brief.update({
    where: { id: draft.brief.id },
    data: {
      sections,
      qualityScore: q.score,
      goals: text("objective"),
      targetAudience: text("audience"),
      successMetrics: text("successMetric"),
      keyMessage: text("keyMessage"),
      references: text("references"),
      deliverablesNotes: [
        text("deliverables") && `Formats: ${text("deliverables")}`,
        text("markets") && `Markets: ${text("markets")}`,
        deadline && `Final by ${formatDay(deadline)}`,
        text("budget") && `Budget: ${budgetLabel(getSection(sections, "budget")!.value)}`,
        text("mustHaves") && `Must-haves: ${text("mustHaves")}`,
        text("notes") && `Notes: ${text("notes")}`,
      ]
        .filter(Boolean)
        .join("\n"),
      status: "ACCEPTED",
      submittedAt: now,
      acceptedAt: now,
      submittedByUserId: draft.brief.submittedByUserId ?? viewer.id,
    },
  });
  await prisma.project.update({ where: { id: projectId }, data: { status: "ESTIMATING", startedAt: draft.project.startedAt ?? now, name: titleFor(sections, parsed), type: parsed.projectType, dueDate: deadline } });
  await prisma.pipelineStage.updateMany({ where: { projectId, name: "BRIEF" }, data: { status: "COMPLETED", completedAt: now } });
  await prisma.pipelineStage.updateMany({ where: { projectId, name: "ESTIMATE" }, data: { status: "ACTIVE", startedAt: now } });
  await logDecision({ projectId, actorUserId: viewer.userId, area: "brief", action: "Client sent the brief", after: { qualityScore: q.score, essentialsCovered: q.essentialsCovered } });
  await postProjectEvent(projectId, "Brief sent");
  await enqueue(projectId, viewer.clientId);
  return { score: q.score };
}
