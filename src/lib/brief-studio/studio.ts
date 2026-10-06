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
import { runBriefUpdateAgent, runSmartStartAgent, runTaskAgent, type SmartStartResult } from "@/lib/ai/agents/brief-studio-agent";
import type { PortalViewer } from "@/lib/brief-intake";
import {
  getSection,
  mergeAgentSections,
  newId,
  sectionFilled,
  setClientSection,
  slot,
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
import { earliestDates, estimatePreview, formatByLabel, formatForAsset, fromIsoDay, isoDay, type PriceEntry } from "@/lib/brief-studio/formats";
import { CLOSING_FOLLOW_UP, LANGUAGE_FOR, QUESTION_BANK, formatsForChannels } from "@/lib/brief-studio/question-bank";
import {
  activeQuestion,
  applyAnswer,
  CONFIDENT_CTA,
  audienceText,
  buildQuestion,
  closingQuestion,
  ctaDestination,
  deliverablesText,
  followUpQuestion,
  nextStep,
  questionsLeft,
  type Answer,
  type FormatStat,
  type PlannerContext,
} from "@/lib/brief-studio/planner";
import { clientVisibleAsset } from "@/lib/qc/visibility";
import { notify } from "@/lib/notifier";

/**
 * The Brief studio on the server. Not a "use server" module: everything here takes a viewer the caller resolved
 * (src/lib/actions/brief-studio-actions.ts), so nothing is callable with someone else's ids.
 */

// ─── Context: what the agent knows ─────────────────────────────────────────

type Persona = { name: string; description: string; ageRange?: string };
type Measured = { id: string; name: string; format: string; ctr: number; projectId: string; projectName: string };

export type PastProject = { id: string; name: string; type: string; score: number; markets: string[]; channels: string[]; measured: Measured[] };

export type StudioContext = {
  brandName: string;
  website: string | null;
  brandContext: string;
  brand: BrandFacts;
  personas: Persona[];
  usps: string[];
  tone: string | null;
  prices: PriceEntry[];
  formatStats: FormatStat[];
  pastProjects: PastProject[];
  pastProjectCount: number;
  /** Real audience comments (Community), for the barrier options' evidence. */
  comments: { platform: string; snippet: string }[];
  teammates: { id: string; name: string }[];
};

/** The agent's drafted chips and The task's inputs, kept on the brief between turns. */
export type AgentDrafts = {
  keyMessageOptions?: string[];
  barrierOptions?: { label: string; reason: string | null }[];
  proofOptions?: string[];
  /** The slot values The task was last written from, so it's only rewritten when they change. */
  taskFrom?: string;
  ideaName?: string | null;
};

const STOP = new Set(["need", "needs", "want", "with", "some", "make", "made", "please", "new", "our", "the", "for", "and", "that", "this", "from"]);
const tokens = (s: string) => new Set(s.toLowerCase().split(/[^a-z0-9åäöæø]+/).filter((t) => t.length > 2 && !STOP.has(t)));
const PLATFORM_CHANNEL: Record<string, string> = { instagram: "Meta", facebook: "Meta", meta: "Meta", tiktok: "TikTok", linkedin: "LinkedIn", snapchat: "Snapchat", youtube: "YouTube / CTV", "display network": "Search & display", google: "Search & display" };

/**
 * The client's 3 most similar past projects the viewer can see, with their measured assets: same type first,
 * then the same channel and shared words, then the ones with performance data, newest first. Only ever this
 * client's projects.
 */
export async function similarPastProjects(clientId: string, viewerClientUserId: string, q: { text: string; parsed: ParsedRequest; excludeProjectId?: string }, limit = 3): Promise<PastProject[]> {
  const projects = await prisma.project.findMany({
    // Past work only: not drafts, and not drafts that were archived before they were ever sent.
    where: { clientId, status: { notIn: ["DRAFT"] }, NOT: { status: "ARCHIVED", startedAt: null }, agentBuild: false, ...(q.excludeProjectId ? { id: { not: q.excludeProjectId } } : {}), ...projectVisibilityWhere(viewerClientUserId) },
    include: { brief: { select: { rawIntake: true, goals: true, sections: true } }, assets: { where: clientVisibleAsset, select: { id: true, name: true, format: true, platform: true, performanceCtr: true } } },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  const want = tokens(q.text);
  const scored = projects.map((p) => {
    const text = `${p.name} ${p.brief?.rawIntake ?? ""} ${p.brief?.goals ?? ""}`;
    const have = tokens(text);
    const sections = jsonArray<BriefSection>(p.brief?.sections);
    const channels = [
      ...((sections.find((s) => s.key === "deliverables")?.data as { channels?: string[] } | undefined)?.channels ?? []),
      ...p.assets.map((a) => PLATFORM_CHANNEL[(a.platform ?? "").toLowerCase()]).filter((c): c is string => Boolean(c)),
    ];
    let score = p.type === q.parsed.projectType ? 3 : 0;
    for (const c of q.parsed.channels) if (channels.includes(c) || new RegExp(c.split(" ")[0], "i").test(text)) score += 2;
    for (const t of want) if (have.has(t)) score += 1;
    const measured = p.assets
      .filter((a) => a.performanceCtr !== null)
      .sort((a, b) => b.performanceCtr! - a.performanceCtr!)
      .map((a) => ({ id: a.id, name: a.name, format: a.format, ctr: a.performanceCtr!, projectId: p.id, projectName: p.name }));
    if (measured.length) score += 1;
    const markets = sections.find((s) => s.key === "markets")?.items ?? [];
    return { id: p.id, name: p.name, type: p.type, score, markets, channels: [...new Set(channels)], measured, createdAt: p.createdAt };
  });
  return scored
    .filter((p) => p.score > 0)
    .sort((a, b) => b.score - a.score || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .map((p) => ({ id: p.id, name: p.name, type: p.type, score: p.score, markets: p.markets, channels: p.channels, measured: p.measured }));
}

/** Latest measured CTR per format: the most recent project that measured that format, its best asset. */
async function formatStatsFor(clientId: string, viewerClientUserId: string): Promise<FormatStat[]> {
  const assets = await prisma.asset.findMany({
    where: { clientId, performanceCtr: { not: null }, ...clientVisibleAsset, project: projectVisibilityWhere(viewerClientUserId) },
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
  const [brandOS, linked, linkedCount, prices, pastProjects, formatStats, pastProjectCount, team, comments] = await Promise.all([
    prisma.brandOS.findUnique({ where: { clientId } }),
    brandSourcesForAgents(clientId),
    prisma.brandSource.count({ where: { clientId, archivedAt: null } }),
    prisma.priceListItem.findMany({ where: { archivedAt: null } }),
    similarPastProjects(clientId, viewer.id, q),
    formatStatsFor(clientId, viewer.id),
    prisma.project.count({ where: { clientId, status: { not: "DRAFT" }, NOT: { status: "ARCHIVED", startedAt: null }, agentBuild: false, ...(q.excludeProjectId ? { id: { not: q.excludeProjectId } } : {}), ...projectVisibilityWhere(viewer.id) } }),
    prisma.clientUser.findMany({ where: { clientId, id: { not: viewer.id }, user: { status: { not: "SUSPENDED" } } }, include: { user: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.communityEscalation.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 12, select: { platform: true, snippet: true } }),
  ]);
  const voice = jsonArray(brandOS?.voiceAttributes).length > 0 || jsonArray(brandOS?.toneRules).length > 0;
  const visual = Boolean(brandOS?.imageryStyle || brandOS?.illustrationStyle || jsonArray(brandOS?.colorPalette).length || brandOS?.approvedTypography);
  return {
    brandName: viewer.client.name,
    website: viewer.client.website?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? null,
    brandContext: buildBrandContext(viewer.client, brandOS, linked),
    brand: { voice, visual, linkedSources: linkedCount },
    personas: jsonArray<Persona>(brandOS?.audiencePersonas),
    usps: jsonArray<string>(brandOS?.usps),
    tone: toneFrom(brandOS),
    prices: prices.map((p) => ({ deliverableType: p.deliverableType, complexityTier: p.complexityTier, creditCost: p.creditCost, leadTimeDays: p.leadTimeDays })),
    formatStats,
    pastProjects,
    pastProjectCount,
    comments,
    teammates: team.map((m) => ({ id: m.id, name: m.user.name })),
  };
}

// ─── State ─────────────────────────────────────────────────────────────────

export type StudioState = { sections: BriefSection[]; messages: StudioMessage[]; log: StudioQuestion[]; drafts: AgentDrafts };

function plannerContext(ctx: StudioContext, parsed: ParsedRequest, drafts: AgentDrafts): PlannerContext {
  const withChannels = ctx.pastProjects.find((p) => p.channels.length);
  const compare = ctx.pastProjects.find((p) => p.measured.length) ?? ctx.pastProjects[0] ?? null;
  return {
    kind: parsed.kind,
    brandName: ctx.brandName,
    formatStats: ctx.formatStats,
    pastChannels: withChannels ? { channels: withChannels.channels, projectName: withChannels.name } : null,
    personas: ctx.personas.map((p) => ({ name: p.name, description: p.description })),
    keyMessageOptions: drafts.keyMessageOptions?.length ? drafts.keyMessageOptions : ctx.usps.slice(0, 3),
    barrierOptions: drafts.barrierOptions?.length
      ? drafts.barrierOptions
      : [
          { label: "Don't know what we offer", reason: null },
          { label: "Think it is not for them", reason: null },
          { label: "Prefer what they use today", reason: null },
        ],
    proofOptions: drafts.proofOptions?.length ? drafts.proofOptions : ctx.usps.slice(0, 3),
    compareTo: compare ? { id: compare.id, name: compare.name } : null,
    website: ctx.website,
  };
}

const isDefault = (s: BriefSection | undefined) => !sectionFilled(s) || (s!.source === "suggested" && !s!.editedByClient && !s!.delegated);

/** Basics follow the slots until the client sets them: the earliest realistic deadline, and a language per market. */
function refreshDefaults(sections: BriefSection[], ctx: StudioContext, now: Date) {
  const formats = slot(sections, "deliverables").formats ?? [];
  let out = sections;
  if (isDefault(getSection(out, "deadline"))) {
    const iso = isoDay(earliestDates(formats, ctx.prices, now).final);
    out = [...out.filter((s) => s.key !== "deadline"), { key: "deadline", value: iso, data: { iso }, source: "suggested", editedByClient: false }];
  }
  const markets = getSection(out, "markets")?.items ?? [];
  if (isDefault(getSection(out, "languages"))) {
    const names = [...new Set(markets.map((m) => LANGUAGE_FOR[m]).filter(Boolean))];
    out = out.filter((s) => s.key !== "languages");
    if (names.length) out.push({ key: "languages", value: "", items: names, data: { names }, source: "suggested", editedByClient: false });
  }
  return out;
}

const quality = (sections: BriefSection[], ctx: StudioContext) => briefQuality({ sections, brand: ctx.brand });
const and = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}` : l[0] ?? "");

// ─── The task ──────────────────────────────────────────────────────────────

function slotsText(sections: BriefSection[]) {
  return sections
    .filter((s) => sectionFilled(s) && s.key !== "task")
    .map((s) => `${SECTION_LABEL[s.key]}: ${[s.value, ...(s.items ?? []), ...(s.refs ?? []).map((r) => r.label)].filter(Boolean).join(", ")}`)
    .join("\n");
}

/** "3 ideas × Stories 9:16 and TikTok in-feed · Swedish and Norwegian · first draft Fri 9 Oct". */
function taskMeta(sections: BriefSection[], ctx: StudioContext, now: Date) {
  const d = slot(sections, "deliverables");
  const languages = getSection(sections, "languages")?.items ?? [];
  const made = [d.ideasCount ? `${d.ideasCount} idea${d.ideasCount === 1 ? "" : "s"}` : null, d.formats?.length ? and(d.formats) : null].filter(Boolean).join(" × ");
  return [made, languages.length ? and(languages) : null, `first draft ${formatDay(earliestDates(d.formats ?? [], ctx.prices, now).firstDraft)}`].filter(Boolean).join(" · ");
}

/** The deterministic sentence, used when the brief agent can't be reached: what + for whom + goal + idea. */
export function taskSentence(sections: BriefSection[], kind: ParsedRequest["kind"]) {
  const d = slot(sections, "deliverables");
  const units = (d.ideasCount ?? 3) * Math.max(1, d.formats?.length ?? 1);
  const noun = QUESTION_BANK[kind].noun;
  const channels = d.channels?.filter((c) => !QUESTION_BANK[kind].fixedChannel || c !== QUESTION_BANK[kind].fixedChannel) ?? [];
  const markets = getSection(sections, "markets")?.items ?? [];
  const audience = slot(sections, "audience");
  const who = audience.personaName ?? (audience.description?.split(/[.,]/)[0] || "the audience");
  const goal = (slot(sections, "objective").goal ?? "").toLowerCase();
  const message = slot(sections, "keyMessage").text ?? getSection(sections, "keyMessage")?.value ?? "";
  return `${units} ${noun}${channels.length ? ` for ${and(channels)}` : ""}${markets.length ? ` in ${and(markets)}` : ""} that ${goal ? `move ${who} to ${goal.replace(/^drive |^grow |^build /, "")}` : `reach ${who}`}${message ? `, around “${message.replace(/[.”"]+$/, "").replace(/^[“"]/, "")}”` : ""}.`;
}

/** Writes (or rewrites) The task once the essentials are in, unless the client has edited it. */
async function ensureTask(state: StudioState, ctx: StudioContext, parsed: ParsedRequest, ids: { clientId: string; projectId: string }, now: Date): Promise<StudioState> {
  const current = getSection(state.sections, "task");
  if (current?.editedByClient) return state;
  if (!quality(state.sections, ctx).essentialsCovered) return state;
  const from = slotsText(state.sections);
  if (current && state.drafts.taskFrom === from) return state;
  const meta = taskMeta(state.sections, ctx, now);
  const ai = await runTaskAgent({ clientId: ids.clientId, projectId: ids.projectId, brief: from })
    .then((r) => (r.ok ? r.data : null))
    .catch(() => null);
  // Ranges come back spelled out now and then ("22 dash 34"): put the dash back.
  const sentence = ai?.sentence?.trim().replace(/(\d+)\s*dash\s*(\d+)/gi, "$1–$2") || taskSentence(state.sections, parsed.kind);
  const task: BriefSection = { key: "task", value: sentence, data: { sentence, meta }, source: "suggested", editedByClient: false };
  return { ...state, sections: [...state.sections.filter((s) => s.key !== "task"), task], drafts: { ...state.drafts, taskFrom: from, ideaName: ai?.ideaName ?? state.drafts.ideaName ?? null } };
}

/** After any change: refresh Basics' defaults, write The task when the essentials are in, then the next question. */
async function advance(state: StudioState, ctx: StudioContext, parsed: ParsedRequest, ids: { clientId: string; projectId: string }, now: Date): Promise<StudioState> {
  let next: StudioState = { ...state, sections: refreshDefaults(state.sections, ctx, now) };
  next = await ensureTask(next, ctx, parsed, ids, now);
  if (activeQuestion(next.log)) return next;
  const pctx = plannerContext(ctx, parsed, next.drafts);
  const step = nextStep(next.sections, next.log, pctx);
  const q = quality(next.sections, ctx);
  const say = (text: string, questionId?: string): StudioMessage => ({ id: newId(questionId ? "m" : "say"), role: "agent", text, at: now.toISOString(), ...(questionId ? { questionId } : {}) });

  if (step === "closing") {
    const first = !next.log.some((x) => x.type === "closing");
    const question = closingQuestion(now);
    const intro = !first
      ? null
      : q.label === "Great"
        ? "I think a designer could start from this. Read **The task** on the right, it is what Klingit will make."
        : q.essentialsCovered
          ? `Read **The task** on the right, it is what Klingit will make. It's a good brief; ${q.suggestions[0] ? `${q.suggestions[0].label.toLowerCase()} to make it great` : "a little more detail makes it great"}, or send it as it is.`
          : `I have most of it. Still missing: ${missingLine(q)}. Add ${q.missingEssentials.length === 1 ? "it" : "them"} on the right, or send it anyway and Klingit will ask.`;
    return { ...next, log: [...next.log, question], messages: [...next.messages, ...(intro ? [say(intro)] : []), say(question.question, question.id)] };
  }
  if (step) {
    const question = buildQuestion(step, next.sections, pctx, { now });
    return { ...next, log: [...next.log, question], messages: [...next.messages, say(question.question, question.id)] };
  }
  // "No, that is everything": the last word.
  if (!next.messages.some((m) => m.id.startsWith("wrap"))) {
    const text = q.label === "Great" ? "That's a great brief. Send it to Klingit when you're ready." : q.essentialsCovered ? "Send it to Klingit when you're ready. They'll take it from The task." : `Send it when you're ready; Klingit will ask about ${missingLine(q)}.`;
    return { ...next, messages: [...next.messages, { id: newId("wrap"), role: "agent", text, at: now.toISOString() }] };
  }
  return next;
}

const ESSENTIAL_NAME: Record<string, string> = { deliverables: "what we're making", whyNow: "why now", objective: "the objective", audience: "the audience", keyMessage: "the one thing to remember", proofOffer: "the proof or offer", cta: "the call to action", material: "the material", deadline: "the markets in Basics" };
const missingLine = (q: BriefQuality) => and(q.missingEssentials.map((k) => ESSENTIAL_NAME[k]));

// ─── Smart start ───────────────────────────────────────────────────────────

function pastProjectsText(ctx: StudioContext) {
  return ctx.pastProjects
    .map((p) => `- ${p.name} (${p.type})${p.channels.length ? `, channels: ${p.channels.join(", ")}` : ""}${p.markets.length ? `, markets: ${p.markets.join(", ")}` : ""}${p.measured.length ? `, measured: ${p.measured.slice(0, 3).map((a) => `${a.name} ${a.format} ${a.ctr}% CTR`).join("; ")}` : ""}`)
    .join("\n");
}

/** Pre-fills every slot it can from the client's words, Brand OS and the most similar past project, each tagged with its source. */
export function prefill(parsed: ParsedRequest, ai: SmartStartResult | null, ctx: StudioContext, now: Date): BriefSection[] {
  const bank = QUESTION_BANK[parsed.kind];
  const answer = (key: SectionKey, v: Partial<BriefSection>): BriefSection => ({ key, value: "", ...v, source: "answer", editedByClient: false });
  const suggest = (key: SectionKey, v: Partial<BriefSection>): BriefSection => ({ key, value: "", ...v, source: "suggested", editedByClient: false });
  const out: BriefSection[] = [];
  const x = ai?.extracted;

  // What's being made: the channels and formats the client named. Formats only for a known channel.
  const aiFormats = (x?.formats ?? []).map((f) => formatByLabel(f)).filter((f) => f && parsed.channels.includes(f.channel)).map((f) => f!.label);
  const formats = [...new Set([...parsed.formats, ...aiFormats])];
  if (parsed.channels.length || formats.length) {
    const data = { channels: parsed.channels, formats, ideasCount: parsed.ideasCount ?? 3 };
    out.push(answer("deliverables", { value: deliverablesText(data), data }));
  }

  const whyNow = parsed.whyNowId ? bank.whyNow.options.find((o) => o.id === parsed.whyNowId)?.label : x?.whyNow;
  if (whyNow) out.push(answer("whyNow", { value: whyNow, data: { reason: whyNow } }));

  if (parsed.objectiveId) {
    const opt = bank.objective.options.find((o) => o.id === parsed.objectiveId);
    const metric = parsed.metric ?? bank.objective.metricFor[parsed.objectiveId] ?? null;
    const goal = opt?.label ?? parsed.objective ?? "";
    out.push(answer("objective", { value: `${goal}${metric ? `. Success = ${metric}` : ""}.`, data: { goal, metric, target: parsed.metric, compareToProjectId: null, compareToName: null } }));
  } else if (x?.objective) {
    out.push(answer("objective", { value: x.objective, data: { goal: x.objective, metric: null, target: null, compareToProjectId: null, compareToName: null } }));
  }

  const message = parsed.keyMessage ?? x?.keyMessage;
  if (message) out.push(answer("keyMessage", { value: message, data: { text: message } }));
  if (x?.proofOffer) out.push(answer("proofOffer", { value: x.proofOffer, data: { text: x.proofOffer, needsLegalLine: null } }));

  // A call to action inferred from the goal: shown, then confirmed ("I'm assuming …, right?").
  const ctaId = parsed.ctaId ?? (parsed.objectiveId === "installs" ? "install" : parsed.objectiveId === "sales" ? "shop" : null);
  const ctaOpt = ctaId ? bank.cta.options.find((o) => o.id === ctaId) : null;
  if (ctaOpt) {
    const destination = ctaDestination(ctaOpt.id, ctx.website);
    const v = { value: [ctaOpt.label, destination].filter(Boolean).join(" · "), data: { action: ctaOpt.label, destination } };
    out.push(parsed.ctaId ? answer("cta", v) : { ...suggest("cta", v), confident: Boolean(parsed.objectiveId && CONFIDENT_CTA[parsed.objectiveId]) });
  }

  // Brand OS: the persona (shown when there's one, confirmed when there are several) and the brand's voice and look.
  const persona = ctx.personas[0];
  if (persona) {
    const data = { personaId: "p0", personaName: persona.name, description: persona.description, barrier: null };
    out.push({ key: "audience", value: audienceText(data), data, source: ctx.personas.length > 1 ? "suggested" : "brandOS", sourceRef: { id: "persona", name: persona.name }, editedByClient: false });
  }
  if (ctx.tone) out.push({ key: "tone", value: ctx.tone, data: { text: ctx.tone }, source: "brandOS", editedByClient: false });

  // Basics: what the client wrote, else the most similar past project's markets.
  const markets = [...new Set([...parsed.markets, ...(x?.markets ?? []).flatMap((m) => (MARKETS.some((k) => k.name === m) ? [m] : parseMarkets(m)))])];
  const withMarkets = ctx.pastProjects.find((p) => p.markets.length);
  if (markets.length) out.push(answer("markets", { items: markets, data: { names: markets } }));
  else if (withMarkets) out.push({ key: "markets", value: "", items: withMarkets.markets, data: { names: withMarkets.markets }, source: "pastProject", sourceRef: { id: withMarkets.id, name: withMarkets.name }, editedByClient: false });
  const deadline = parsed.deadline ?? (x?.deadline ? fromIsoDay(x.deadline) : null);
  if (deadline) out.push(answer("deadline", { value: isoDay(deadline), data: { iso: isoDay(deadline) } }));

  const refProject = ctx.pastProjects.find((p) => p.measured.length);
  if (refProject) {
    const refs: BriefRef[] = refProject.measured.slice(0, 2).map((a) => ({ kind: "asset", id: a.id, label: a.name, sub: `${a.ctr}% CTR · ${a.format.split(/\s/)[0]}` }));
    out.push({ key: "references", value: "", refs, data: { refs }, source: "pastProject", sourceRef: { id: refProject.id, name: refProject.name }, editedByClient: false });
  }
  if (parsed.mustInclude.length) out.push(answer("mustInclude", { items: parsed.mustInclude, data: { items: parsed.mustInclude } }));
  if (parsed.mustAvoid.length) out.push(answer("mustAvoid", { items: parsed.mustAvoid, data: { items: parsed.mustAvoid } }));
  // A budget ceiling only when the client mentions one.
  if (parsed.budgetCredits) out.push(answer("budgetCeiling", { value: `Up to ${parsed.budgetCredits} credits`, data: { credits: parsed.budgetCredits } }));

  return refreshDefaults(mergeAgentSections([], out), ctx, now);
}

function draftsFrom(ai: SmartStartResult | null, ctx: StudioContext): AgentDrafts {
  if (!ai) return {};
  return {
    keyMessageOptions: ai.keyMessageOptions.filter(Boolean).slice(0, 3),
    // "Recommended" only with real data: the comment the agent pointed to must exist.
    barrierOptions: ai.barrierOptions.slice(0, 4).map((b) => {
      const c = b.evidence !== null && b.evidence >= 0 ? ctx.comments[b.evidence] : undefined;
      return { label: b.label, reason: c ? `seen in your ${c.platform} comments` : null };
    }),
    proofOptions: ai.proofOptions.filter(Boolean).slice(0, 3),
  };
}

/** "I started your brief from your Brand OS and your last Meta campaign, **Summer social pack**. …" */
export function summaryLine(sections: BriefSection[], parsed: ParsedRequest, left: number) {
  const from: string[] = [];
  if (sections.some((s) => s.source === "brandOS")) from.push("your Brand OS");
  const past = sections.find((s) => s.source === "pastProject")?.sourceRef;
  if (past) from.push(`your last ${parsed.channels.length === 1 ? `${parsed.channels[0]} ` : ""}${parsed.kind === "deck" ? "deck" : "campaign"}, **${past.name}**`);
  const shown = (["audience", "tone", "references", "markets"] as SectionKey[]).filter((k) => sectionFilled(getSection(sections, k)) && getSection(sections, k)!.source !== "answer").map((k) => (k === "tone" ? "tone and brand" : k === "audience" ? "audience" : k));
  const start = from.length ? `I started your brief from ${and(from)}.` : sections.some((s) => s.source === "answer") ? "I started your brief from what you wrote." : "I started your brief.";
  const parts = [start];
  if (shown.length) parts.push(`${and(shown).replace(/^./, (c) => c.toUpperCase())} ${shown.length === 1 ? "is" : "are"} already filled in on the right.`);
  parts.push(left ? `About ${left} quick question${left === 1 ? "" : "s"} and you are done.` : "That covers the essentials.");
  return parts.join(" ");
}

/** Creates the project as a draft with its brief straight away (so it autosaves), then runs the smart start. */
export async function startStudio(viewer: PortalViewer, text: string, now = new Date()) {
  const parsed = parseRequest(text, now);
  const project = await prisma.project.create({
    data: { clientId: viewer.clientId, name: briefTitle({ kind: parsed.kind, channels: parsed.channels, objectiveId: parsed.objectiveId, markets: parsed.markets, text }), type: parsed.projectType, status: "DRAFT", createdByClientUserId: viewer.id },
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
  const ai = await runSmartStartAgent({
    clientId: viewer.clientId,
    projectId,
    text,
    brandContext: ctx.brandContext,
    pastProjects: pastProjectsText(ctx),
    comments: ctx.comments.map((c) => `${c.platform}: ${c.snippet}`),
    today: isoDay(now),
  })
    .then((r) => (r.ok ? r.data : null))
    .catch(() => null);
  const drafts = draftsFrom(ai, ctx);
  const sections = prefill(parsed, ai, ctx, now);
  const client: StudioMessage = { id: newId("m"), role: "client", text, at: now.toISOString(), authorName: viewer.user.name };
  const ids = { clientId: viewer.clientId, projectId };
  const advanced = await advance({ sections, messages: [client], log: [], drafts }, ctx, parsed, ids, now);
  // The summary goes before the first question.
  const left = questionsLeft(advanced.sections, advanced.log, plannerContext(ctx, parsed, drafts));
  const summary: StudioMessage = { id: newId("say"), role: "agent", text: summaryLine(advanced.sections, parsed, left), at: now.toISOString() };
  return { state: { ...advanced, messages: [client, summary, ...advanced.messages.slice(1)] }, ctx, parsed };
}

// ─── Loading and saving ────────────────────────────────────────────────────

/** The viewer's own draft brief (their client, visible to them, not yet sent). */
export async function loadDraft(viewer: PortalViewer, projectId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, clientId: viewer.clientId, ...projectVisibilityWhere(viewer.id) }, include: { brief: true } });
  if (!project) return null;
  const brief = project.brief ?? (await prisma.brief.create({ data: { projectId, status: "DRAFT" } }));
  const editable = ["DRAFT", "BRIEFING"].includes(project.status) && (brief.status === "DRAFT" || brief.status === "GAPS_FLAGGED");
  return { project, brief, editable };
}

/** Briefs started before the slots: their old sections map onto the new ones. */
function normalize(sections: BriefSection[]): BriefSection[] {
  type Old = BriefSection & { key: string };
  return (sections as Old[]).flatMap((s): BriefSection[] => {
    const k = s.key as string;
    if (k === "successMetric" || k === "budget") return k === "budget" && s.source === "answer" && /^\d+$/.test(s.value) ? [{ ...s, key: "budgetCeiling", value: `Up to ${s.value} credits`, data: { credits: Number(s.value) } }] : [];
    if (k === "mustHaves") return [{ ...s, key: "mustInclude" }];
    if (s.key === "deliverables" && !s.data && s.items?.length) {
      const formats = s.items;
      const channels = [...new Set(formats.map((f) => formatByLabel(f)?.channel).filter((c): c is string => Boolean(c)))];
      return [{ ...s, value: deliverablesText({ channels, formats, ideasCount: 3 }), items: undefined, data: { channels, formats, ideasCount: 3 } }];
    }
    if (s.key === "audience" && !s.data) return [{ ...s, data: { personaId: s.sourceRef?.id === "persona" ? "p0" : null, personaName: s.sourceRef?.name ?? null, description: s.value, barrier: null } }];
    if (s.key === "objective" && !s.data) return [{ ...s, data: { goal: s.value, metric: null, target: null, compareToProjectId: null, compareToName: null } }];
    if (s.key === "keyMessage" && !s.data) return [{ ...s, data: { text: s.value } }];
    return [s as BriefSection];
  });
}

function stateOf(brief: { sections: unknown; messages: unknown; questionsLog: unknown; agentDrafts: unknown }): StudioState {
  return {
    sections: normalize(jsonArray<BriefSection>(brief.sections)),
    messages: jsonArray<StudioMessage>(brief.messages),
    log: jsonArray<StudioQuestion>(brief.questionsLog),
    drafts: (brief.agentDrafts && typeof brief.agentDrafts === "object" ? brief.agentDrafts : {}) as AgentDrafts,
  };
}

const titleFor = (state: StudioState, parsed: ParsedRequest) => {
  const objective = slot(state.sections, "objective").goal ?? null;
  const objectiveId = QUESTION_BANK[parsed.kind].objective.options.find((o) => o.label === objective)?.id ?? parsed.objectiveId;
  return briefTitle({ kind: parsed.kind, channels: slot(state.sections, "deliverables").channels ?? parsed.channels, objectiveId, markets: getSection(state.sections, "markets")?.items ?? [], text: parsed.raw, idea: state.drafts.ideaName });
};

async function persist(briefId: string, projectId: string, state: StudioState, ctx: StudioContext, parsed: ParsedRequest) {
  const q = quality(state.sections, ctx);
  const deadline = fromIsoDay(getSection(state.sections, "deadline")?.value ?? "");
  await prisma.brief.update({ where: { id: briefId }, data: { sections: state.sections, messages: state.messages, questionsLog: state.log, agentDrafts: state.drafts, qualityScore: q.score } });
  await prisma.project.update({ where: { id: projectId }, data: { name: titleFor(state, parsed), type: parsed.projectType, dueDate: deadline } });
}

// ─── The view the studio renders ───────────────────────────────────────────

export type StudioView = {
  projectId: string;
  title: string;
  kind: ParsedRequest["kind"];
  editable: boolean;
  sections: BriefSection[];
  quality: BriefQuality;
  active: StudioQuestion | null;
  log: StudioQuestion[];
  messages: StudioMessage[];
  questionsLeft: number;
  readyToSend: boolean;
  estimate: { low: number; high: number; unpriced: string[] } | null;
  basics: {
    deadline: { iso: string; label: string; earliestIso: string; earliestLabel: string; firstDraftLabel: string };
    markets: string[];
    marketOptions: string[];
  };
  agentNote: string;
  teammates: { id: string; name: string }[];
  savedAt: string;
};

export function buildView(projectId: string, editable: boolean, state: StudioState, ctx: StudioContext, parsed: ParsedRequest, now = new Date()): StudioView {
  const q = quality(state.sections, ctx);
  const d = slot(state.sections, "deliverables");
  const material = slot(state.sections, "material");
  const estimate = estimatePreview({ formats: d.formats ?? [], ideasCount: d.ideasCount }, ctx.prices, material);
  const earliest = earliestDates(d.formats ?? [], ctx.prices, now);
  const deadlineIso = getSection(state.sections, "deadline")?.value || isoDay(earliest.final);
  const markets = getSection(state.sections, "markets")?.items ?? [];
  const n = ctx.pastProjectCount;
  return {
    projectId,
    title: titleFor(state, parsed),
    kind: parsed.kind,
    editable,
    sections: state.sections,
    quality: q,
    active: activeQuestion(state.log),
    log: state.log,
    messages: state.messages,
    questionsLeft: questionsLeft(state.sections, state.log, plannerContext(ctx, parsed, state.drafts)),
    readyToSend: q.essentialsCovered,
    estimate,
    basics: {
      deadline: { iso: deadlineIso, label: formatDay(fromIsoDay(deadlineIso) ?? earliest.final), earliestIso: isoDay(earliest.final), earliestLabel: formatDay(earliest.final), firstDraftLabel: formatDay(earliest.firstDraft) },
      markets,
      marketOptions: [...new Set([...markets, ...MARKETS.map((m) => m.name)])],
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

type Env = { ctx: StudioContext; parsed: ParsedRequest; now: Date; pctx: PlannerContext };

/** Loads, applies one change, lets the agent move on, saves, and returns the new view. */
async function mutate(viewer: PortalViewer, projectId: string, change: (state: StudioState, env: Env) => StudioState | Promise<StudioState>) {
  const draft = await loadDraft(viewer, projectId);
  if (!draft || !draft.editable) return null;
  const now = new Date();
  const { parsed, ctx } = await contextFor(viewer, projectId, draft.brief.rawIntake);
  const before = stateOf(draft.brief);
  const changed = await change(before, { ctx, parsed, now, pctx: plannerContext(ctx, parsed, before.drafts) });
  const next = await advance(changed, ctx, parsed, { clientId: viewer.clientId, projectId }, now);
  await persist(draft.brief.id, projectId, next, ctx, parsed);
  return buildView(projectId, true, next, ctx, parsed, now);
}

function markAnswered(log: StudioQuestion[], id: string, patch: Partial<StudioQuestion>) {
  return log.map((q) => (q.id === id ? { ...q, ...patch, answeredAt: new Date().toISOString() } : q));
}

export function answerQuestion(viewer: PortalViewer, projectId: string, questionId: string, answer: Answer) {
  return mutate(viewer, projectId, (state, { now, pctx }) => {
    const q = state.log.find((x) => x.id === questionId && !x.answeredAt);
    if (!q) return state;
    const messages = answer.freeText ? [...state.messages, { id: newId("m"), role: "client" as const, text: answer.freeText, at: now.toISOString(), authorName: viewer.user.name }] : state.messages;
    const log = markAnswered(state.log, q.id, { chosen: answer.chosen ?? [], freeText: answer.freeText || undefined, delegated: answer.delegate || undefined });

    if (q.type === "closing") {
      const chip = (answer.chosen ?? [])[0];
      // A closing chip opens its short follow-up; "No, that is everything" ends the flow.
      if (chip && chip !== "done" && chip in CLOSING_FOLLOW_UP) {
        const f = followUpQuestion(chip as keyof typeof CLOSING_FOLLOW_UP, now);
        return { ...state, messages: [...messages, { id: newId("m"), role: "agent", text: f.question, at: now.toISOString(), questionId: f.id }], log: [...log, f] };
      }
      if (answer.freeText) return { ...state, sections: setClientSection(state.sections, "notes", { value: [getSection(state.sections, "notes")?.value, answer.freeText].filter(Boolean).join("\n") }), messages, log };
      return { ...state, messages, log };
    }
    return { ...state, sections: applyAnswer(state.sections, q, answer, pctx), log, messages };
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
    const full = draft.brief.rawIntake && !draft.brief.rawIntake.includes(active) ? `${draft.brief.rawIntake}\n\n${active}` : active;
    await prisma.brief.update({ where: { id: draft.brief.id }, data: { rawIntake: full, submittedByUserId: draft.brief.submittedByUserId ?? viewer.id } });
    const { state, ctx, parsed } = await smartStart(viewer, projectId, full, now);
    const merged = { ...state, sections: mergeAgentSections(stateOf(draft.brief).sections, state.sections) };
    await persist(draft.brief.id, projectId, merged, ctx, parsed);
    return buildView(projectId, true, merged, ctx, parsed, now);
  }
  const open = draft ? activeQuestion(stateOf(draft.brief).log) : null;
  if (open) return answerQuestion(viewer, projectId, open.id, { freeText: active });
  return mutate(viewer, projectId, async (state, { ctx, now }) => {
    const clientMsg: StudioMessage = { id: newId("m"), role: "client", text: active, at: now.toISOString(), authorName: viewer.user.name };
    const result = await runBriefUpdateAgent({ clientId: viewer.clientId, projectId, text: active, brief: slotsText(state.sections), brandContext: ctx.brandContext }).catch(() => null);
    let sections = state.sections;
    let reply = "Noted. I've added that to the brief.";
    if (result?.ok) {
      reply = result.data.reply;
      // The client's own message: it lands as their answer, but never over something they edited themselves.
      for (const u of result.data.updates) {
        if (getSection(sections, u.key)?.editedByClient) continue;
        sections = setClientSection(sections, u.key, { value: u.value, items: u.items.length ? u.items : undefined });
      }
    } else {
      sections = setClientSection(sections, "notes", { value: [getSection(sections, "notes")?.value, active].filter(Boolean).join("\n") });
    }
    return { ...state, sections, messages: [...state.messages, clientMsg, { id: newId("say"), role: "agent", text: reply, at: now.toISOString() }] };
  });
}

const LIST_KEYS = new Set<SectionKey>(["markets", "languages", "mustInclude", "mustAvoid", "competitorExamples"]);

/** Inline edit on the canvas: the client's value, protected from the agent. Editing the asked section answers it. */
export function editSection(viewer: PortalViewer, projectId: string, key: SectionKey, patch: { value?: string; items?: string[] }) {
  return mutate(viewer, projectId, (state) => {
    let sections = state.sections;
    if (key === "deliverables" && patch.value !== undefined) {
      // The text drives the slot: formats and channels it names, how many ideas.
      const d = slot(sections, "deliverables");
      const parsed = parseRequest(patch.value);
      const ideas = patch.value.match(/(\d+)\s*ideas?/i);
      const formats = patch.value.split(/,|×|\band\b/).map((t) => formatByLabel(t.trim())?.label).filter((f): f is string => Boolean(f));
      const data = { channels: parsed.channels.length ? parsed.channels : d.channels ?? [], formats: formats.length ? [...new Set(formats)] : d.formats ?? [], ideasCount: ideas ? Number(ideas[1]) : d.ideasCount ?? 3 };
      sections = setClientSection(sections, "deliverables", { value: deliverablesText(data), data });
    } else if (LIST_KEYS.has(key)) {
      const items = patch.items ?? (patch.value ?? "").split(",").map((x) => x.trim()).filter(Boolean);
      sections = setClientSection(sections, key, { value: "", items, data: key === "markets" || key === "languages" ? { names: items } : { items } });
    } else {
      const value = patch.value ?? "";
      const data = key === "keyMessage" ? { text: value } : key === "whyNow" ? { reason: value } : key === "task" ? { sentence: value, meta: (slot(sections, "task").meta as string | undefined) ?? "" } : undefined;
      sections = setClientSection(sections, key, { value, ...(data ? { data } : {}) });
    }
    const open = activeQuestion(state.log);
    const log = open?.key === key ? markAnswered(state.log, open.id, { chosen: [], freeText: patch.value ?? patch.items?.join(", ") }) : state.log;
    return { ...state, sections, log };
  });
}

/** Basics: deadline and markets (never asked in the conversation). Languages follow the markets until edited. */
export function setBasics(viewer: PortalViewer, projectId: string, basics: { deadline?: string; markets?: string[] }) {
  return mutate(viewer, projectId, (state) => {
    let sections = state.sections;
    if (basics.deadline && fromIsoDay(basics.deadline)) sections = setClientSection(sections, "deadline", { value: basics.deadline, data: { iso: basics.deadline } });
    if (basics.markets) sections = setClientSection(sections, "markets", { value: "", items: basics.markets, data: { names: basics.markets } });
    return { ...state, sections };
  });
}

/** "Make it great": ask for one nice-to-have now. A question still open is set aside and comes back later. */
export function askAbout(viewer: PortalViewer, projectId: string, key: SectionKey) {
  const FOLLOW: Partial<Record<SectionKey, keyof typeof CLOSING_FOLLOW_UP>> = { mustAvoid: "avoid", competitorExamples: "competitor", approver: "approver", proofOffer: "legal" };
  return mutate(viewer, projectId, (state, { now, pctx }) => {
    const open = activeQuestion(state.log);
    if (open?.key === key) return state;
    const log = open ? state.log.filter((q) => q.id !== open.id) : state.log;
    const messages = open ? state.messages.filter((m) => m.questionId !== open.id) : state.messages;
    const follow = FOLLOW[key];
    const question = follow
      ? followUpQuestion(follow, now)
      : key === "deliverables"
        ? { ...buildQuestion("formats", state.sections, pctx, { now }), requested: true }
        : key === "objective"
          ? { ...buildQuestion("objective", state.sections, pctx, { now }), requested: true }
          : { ...followUpQuestion("avoid", now), key, part: key, question: key === "references" ? "Anything it should look or feel like?" : key === "mustInclude" ? "Anything it must include?" : "Anything else?", hint: key === "references" ? "Paste a link, or attach a file below" : undefined };
    return { ...state, log: [...log, question], messages: [...messages, { id: newId("m"), role: "agent", text: question.question, at: now.toISOString(), questionId: question.id }] };
  });
}

export function addReference(viewer: PortalViewer, projectId: string, ref: BriefRef) {
  return mutate(viewer, projectId, (state) => {
    const current = getSection(state.sections, "references");
    const refs = [...(current?.refs ?? []), ref];
    let log = state.log;
    const open = activeQuestion(log);
    if (open?.key === "references" || open?.key === "competitorExamples") log = markAnswered(log, open.id, { chosen: [], freeText: ref.label });
    return { ...state, sections: setClientSection(state.sections, "references", { value: "", refs, data: { refs } }), log };
  });
}

export async function inviteTeammate(viewer: PortalViewer, projectId: string, clientUserId: string) {
  const draft = await loadDraft(viewer, projectId);
  if (!draft?.editable) return null;
  const mate = await prisma.clientUser.findFirst({ where: { id: clientUserId, clientId: viewer.clientId }, include: { user: true } });
  if (!mate) return null;
  // A member can see the draft even when it's confidential.
  await prisma.projectMember.upsert({ where: { projectId_clientUserId: { projectId, clientUserId: mate.id } }, update: {}, create: { projectId, clientUserId: mate.id } });
  await notify({
      userId: mate.userId,
      clientId: viewer.clientId,
      projectId,
      type: "SYSTEM",
      title: `${viewer.user.name} asked you to help with a brief`,
      body: `"${draft.project.name}": answer the open questions or edit any section.`,
      actionUrl: `/brief/${projectId}`,
      actionLabel: "Open brief",
    });
  return mutate(viewer, projectId, (state, { now }) => ({
    ...state,
    messages: [...state.messages, { id: newId("say"), role: "agent", text: `${mate.user.name.split(" ")[0]} is invited and can answer here too.`, at: now.toISOString() }],
  }));
}

/**
 * Send brief to Klingit: never blocked by the score. Completes the brief, moves the project to estimating and
 * queues it; the caller then runs autopilot (the Estimate agent) after the response.
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
  const task = getSection(sections, "task");
  const now = new Date();

  // The legacy columns stay filled, so the Estimate agent and the brief record read the same brief; The task is the summary.
  await prisma.brief.update({
    where: { id: draft.brief.id },
    data: {
      sections,
      qualityScore: q.score,
      aiSummary: task?.value || null,
      goals: [text("task"), text("objective")].filter(Boolean).join("\n") || null,
      targetAudience: text("audience"),
      successMetrics: slot(sections, "objective").metric ?? null,
      keyMessage: text("keyMessage"),
      references: [text("references"), text("competitorExamples")].filter(Boolean).join("\n") || null,
      deliverablesNotes: [
        text("deliverables") && `Making: ${text("deliverables")}`,
        text("material") && `Material: ${text("material")}`,
        text("markets") && `Markets: ${text("markets")}`,
        text("languages") && `Languages: ${text("languages")}`,
        deadline && `Final by ${formatDay(deadline)}`,
        text("proofOffer") && `Proof and offer: ${text("proofOffer")}`,
        text("cta") && `Call to action: ${text("cta")}`,
        text("mustInclude") && `Must include: ${text("mustInclude")}`,
        text("mustAvoid") && `Must avoid: ${text("mustAvoid")}`,
        text("approver") && `Signs off: ${text("approver")}${text("feedbackRounds") ? `, ${text("feedbackRounds")}` : ""}`,
        text("budgetCeiling") && `Budget: ${text("budgetCeiling")}`,
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
  await prisma.project.update({ where: { id: projectId }, data: { status: "ESTIMATING", startedAt: draft.project.startedAt ?? now, name: titleFor({ ...state, sections }, parsed), type: parsed.projectType, dueDate: deadline } });
  await prisma.pipelineStage.updateMany({ where: { projectId, name: "BRIEF" }, data: { status: "COMPLETED", completedAt: now } });
  await prisma.pipelineStage.updateMany({ where: { projectId, name: "ESTIMATE" }, data: { status: "ACTIVE", startedAt: now } });
  await logDecision({ projectId, actorUserId: viewer.userId, area: "brief", action: "Client sent the brief", after: { qualityScore: q.score, essentialsCovered: q.essentialsCovered } });
  await postProjectEvent(projectId, "Brief sent");
  await enqueue(projectId, viewer.clientId);
  return { score: q.score };
}

export { formatsForChannels };
