import {
  getSection,
  HARD_QUESTION_CEILING,
  newId,
  sectionFilled,
  setClientSection,
  type BriefSection,
  type QuestionOption,
  type SectionKey,
  type StudioQuestion,
} from "@/lib/brief-studio/model";
import { formatsFor, formatForLabel, isoDay, fromIsoDay, type DeliverableKind } from "@/lib/brief-studio/formats";
import { parseDeadline, parseMarkets } from "@/lib/brief-studio/parse";
import { formatDay } from "@/lib/project-state";

/**
 * The brief agent's questions: one at a time, only for what isn't known yet, the most valuable first. The agent
 * stops once the essentials are in or the brief scores 80, and never asks more than 8. Chips carry real data
 * only (past CTR, markets used before, the Price List); without data there is no "Recommended".
 */

export type FormatStat = { formatId: string; ctr: number; projectName: string };
export type TopAsset = { id: string; name: string; format: string; ctr: number; projectId: string; projectName: string };

export type PlannerContext = {
  kind: DeliverableKind;
  /** Latest measured CTR per format, from the client's own delivered assets. */
  formatStats: FormatStat[];
  usps: string[];
  topAssets: TopAsset[];
  /** Markets of the most similar past project that recorded them. */
  pastMarkets: { markets: string[]; projectName: string } | null;
  estimate: { low: number; high: number } | null;
  earliest: { firstDraft: Date; final: Date };
};

/** The agent asks these even when it already has a suggestion: guessing them wrong changes the whole job. */
const ASK_IF_SUGGESTED = new Set<SectionKey>(["objective", "deliverables"]);
/** Essentials, by impact (points in briefQuality), then what's quickest to answer. */
const PLAN_ORDER: SectionKey[] = ["objective", "deliverables", "audience", "markets", "keyMessage", "deadline"];

export function needsAsking(sections: BriefSection[], key: SectionKey) {
  const s = getSection(sections, key);
  if (!sectionFilled(s)) return true;
  return s!.source === "suggested" && !s!.editedByClient && !s!.delegated && ASK_IF_SUGGESTED.has(key);
}

export const agentQuestionsAsked = (log: StudioQuestion[]) => log.filter((q) => !q.requested).length;
export const activeQuestion = (log: StudioQuestion[]) => log.find((q) => !q.answeredAt) ?? null;

/** What the agent still plans to ask, in order. Empty once the essentials are in or the score is 80+. */
export function plannedKeys(sections: BriefSection[], score: number) {
  if (score >= 80) return [];
  return PLAN_ORDER.filter((k) => needsAsking(sections, k));
}

export function nextQuestionKey(sections: BriefSection[], log: StudioQuestion[], score: number): SectionKey | null {
  if (agentQuestionsAsked(log) >= HARD_QUESTION_CEILING) return null;
  return plannedKeys(sections, score)[0] ?? null;
}

/** "About N questions left": the plan, capped by the ceiling, plus a question the client asked for. */
export function questionsLeft(sections: BriefSection[], log: StudioQuestion[], score: number) {
  const active = activeQuestion(log);
  const planned = Math.min(HARD_QUESTION_CEILING - agentQuestionsAsked(log) + (active && !active.requested ? 1 : 0), plannedKeys(sections, score).length);
  return Math.max(0, planned) + (active?.requested ? 1 : 0);
}

// ─── Building one question ─────────────────────────────────────────────────

const OBJECTIVE_OPTIONS: Record<DeliverableKind, QuestionOption[]> = {
  ads: [
    { id: "installs", label: "App installs" },
    { id: "awareness", label: "Awareness" },
    { id: "sales", label: "Sales" },
    { id: "winback", label: "Win back old users" },
  ],
  social: [
    { id: "awareness", label: "Awareness" },
    { id: "engagement", label: "Engagement" },
    { id: "sales", label: "Sales" },
    { id: "launch", label: "Launch something new" },
  ],
  deck: [
    { id: "pitch", label: "Win a pitch or a deal" },
    { id: "investors", label: "Update investors or the board" },
    { id: "internal", label: "Align the team" },
    { id: "launch", label: "Launch something new" },
  ],
  video: [
    { id: "awareness", label: "Awareness" },
    { id: "explain", label: "Explain the product" },
    { id: "launch", label: "Launch something new" },
    { id: "sales", label: "Sales" },
  ],
  web: [
    { id: "signups", label: "Sign-ups" },
    { id: "sales", label: "Sales" },
    { id: "launch", label: "Launch something new" },
    { id: "inform", label: "Inform" },
  ],
  email: [
    { id: "sales", label: "Sales" },
    { id: "winback", label: "Win back old users" },
    { id: "onboarding", label: "Onboard new users" },
    { id: "news", label: "Share news" },
  ],
  brand: [
    { id: "consistency", label: "Keep the brand consistent" },
    { id: "rebrand", label: "Roll out a rebrand" },
    { id: "agencies", label: "Brief partners and agencies" },
  ],
  other: [
    { id: "awareness", label: "Awareness" },
    { id: "sales", label: "Sales" },
    { id: "launch", label: "Launch something new" },
    { id: "internal", label: "Internal use" },
  ],
};

const OBJECTIVE_TEXT: Record<string, string> = {
  installs: "Drive app installs",
  awareness: "Build awareness",
  sales: "Drive sales",
  winback: "Win back lapsed users",
  engagement: "Grow engagement",
  launch: "Launch something new",
  pitch: "Win a pitch or a deal",
  investors: "Update investors and the board",
  internal: "Align the team internally",
  explain: "Explain the product",
  signups: "Drive sign-ups",
  inform: "Inform visitors",
  onboarding: "Onboard new users",
  news: "Share news",
  consistency: "Keep the brand consistent everywhere",
  rebrand: "Roll out a rebrand",
  agencies: "Brief partners and agencies",
};

const AUDIENCE_OPTIONS: QuestionOption[] = [
  { id: "existing", label: "Existing customers" },
  { id: "new", label: "New customers" },
  { id: "young", label: "Gen Z, 18–24" },
  { id: "b2b", label: "Business buyers" },
];

const MUST_HAVE_OPTIONS: QuestionOption[] = [
  { id: "legal", label: "Legal disclaimer" },
  { id: "price", label: "Price and terms" },
  { id: "logo", label: "Logo lockup" },
  { id: "none", label: "Nothing specific" },
];

const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;

export function buildQuestion(key: SectionKey, ctx: PlannerContext, opts: { requested?: boolean; now?: Date } = {}): StudioQuestion {
  const base = { id: newId("q"), key, askedAt: (opts.now ?? new Date()).toISOString(), requested: opts.requested || undefined };
  const reason: Record<string, string> = {};
  let recommended: string[] = [];

  switch (key) {
    case "objective":
      return { ...base, question: questionText(ctx.kind), type: "single", options: OBJECTIVE_OPTIONS[ctx.kind], recommendedOptionIds: [], reasonPerOption: {} };

    case "deliverables": {
      const options = formatsFor(ctx.kind).map((f) => ({ id: f.id, label: f.label }));
      const withData = options.map((o) => ({ o, stat: ctx.formatStats.find((s) => s.formatId === o.id) })).filter((x) => x.stat);
      const best = [...withData].sort((a, b) => b.stat!.ctr - a.stat!.ctr)[0];
      for (const { o, stat } of withData) reason[o.id] = o.id === best?.o.id ? `${pct(stat!.ctr)} CTR last time` : `${pct(stat!.ctr)} CTR`;
      if (best) recommended = [best.o.id];
      return { ...base, question: ctx.kind === "deck" ? "How big is the deck?" : "Which formats?", hint: "Pick any", type: "multi", options, recommendedOptionIds: recommended, reasonPerOption: reason };
    }

    case "audience":
      return { ...base, question: "Who is it for?", type: "single", options: AUDIENCE_OPTIONS, recommendedOptionIds: [], reasonPerOption: {} };

    case "markets": {
      const past = ctx.pastMarkets?.markets ?? [];
      const names = [...new Set([...past, "Sweden", "Norway", "Denmark", "Finland", "Germany", "United Kingdom"])].slice(0, 7);
      const options = names.map((n) => ({ id: n, label: n }));
      for (const m of past) reason[m] = `Used in ${ctx.pastMarkets!.projectName}`;
      return { ...base, question: "Which markets?", hint: "Pick any", type: "multi", options, recommendedOptionIds: past, reasonPerOption: reason };
    }

    case "keyMessage": {
      const options = ctx.usps.slice(0, 3).map((u, i) => ({ id: `usp${i}`, label: u }));
      for (const o of options) reason[o.id] = "From your Brand OS";
      return { ...base, question: "What's the one thing people should take away?", hint: options.length ? "Pick one or write your own" : "Write it in your own words", type: options.length ? "single" : "text", options, recommendedOptionIds: [], reasonPerOption: reason };
    }

    case "deadline": {
      const final = ctx.earliest.final;
      const days = [final, new Date(final.getFullYear(), final.getMonth(), final.getDate() + 7), new Date(final.getFullYear(), final.getMonth(), final.getDate() + 14)];
      const options = days.map((d) => ({ id: isoDay(d), label: formatDay(d) }));
      reason[options[0].id] = "Earliest realistic date";
      return { ...base, question: "When do you need the final files?", type: "date", options, recommendedOptionIds: [], reasonPerOption: reason };
    }

    case "successMetric": {
      const best = [...ctx.formatStats].sort((a, b) => b.ctr - a.ctr)[0];
      const options: QuestionOption[] = [
        ...(best ? [{ id: "beat_ctr", label: `Beat ${pct(best.ctr)} CTR` }] : []),
        { id: "volume", label: ctx.kind === "deck" ? "A meeting or deal won" : "A target for installs or sales" },
        { id: "reach", label: "Reach and awareness lift" },
        { id: "none", label: "No hard KPI" },
      ];
      if (best) {
        reason.beat_ctr = `Your best so far, ${best.projectName}`;
        recommended = ["beat_ctr"];
      }
      return { ...base, question: "How will you know it worked?", type: "single", options, recommendedOptionIds: recommended, reasonPerOption: reason };
    }

    case "mustHaves":
      return { ...base, question: "Anything it must include or avoid?", hint: "Pick any", type: "multi", options: MUST_HAVE_OPTIONS, recommendedOptionIds: [], reasonPerOption: {} };

    case "references": {
      const options = ctx.topAssets.slice(0, 3).map((a) => ({ id: a.id, label: `Like ${a.name}` }));
      for (const a of ctx.topAssets.slice(0, 3)) reason[a.id] = `${pct(a.ctr)} CTR · ${a.projectName}`;
      if (ctx.topAssets[0]) recommended = [ctx.topAssets[0].id];
      return {
        ...base,
        question: "Anything it should look or feel like?",
        hint: "Pick any, or attach a file or link below",
        type: "multi",
        options: [...options, { id: "none", label: "No references" }],
        recommendedOptionIds: recommended,
        reasonPerOption: reason,
      };
    }

    case "budget": {
      const high = ctx.estimate?.high ?? null;
      const caps = high ? [roundUp(high), roundUp(high * 1.5)] : [20, 40];
      const options = [...new Set(caps)].map((c) => ({ id: `credits:${c}`, label: `Up to ${c} credits` }));
      if (high) reason[options[0].id] = `Covers the ≈ ${ctx.estimate!.low}–${ctx.estimate!.high} estimate`;
      return { ...base, question: "What budget should we work to?", type: "single", options: [...options, { id: "flexible", label: "Flexible" }], recommendedOptionIds: high ? [options[0].id] : [], reasonPerOption: reason };
    }

    default:
      return { ...base, question: "Anything else we should know?", type: "text", options: [], recommendedOptionIds: [], reasonPerOption: {} };
  }
}

function questionText(kind: DeliverableKind) {
  return kind === "ads" ? "What should the ads achieve?" : kind === "deck" ? "What is the deck for?" : "What should it achieve?";
}

export const roundUp = (n: number) => Math.ceil(n / 5) * 5;

// ─── Applying an answer ────────────────────────────────────────────────────

export type Answer = { chosen?: string[]; freeText?: string; delegate?: boolean };

/** Writes the client's answer (or "Let Klingit decide") into its section. */
export function applyAnswer(sections: BriefSection[], q: StudioQuestion, answer: Answer, ctx: PlannerContext): BriefSection[] {
  const chosen = (answer.chosen ?? []).filter((id) => q.options.some((o) => o.id === id));
  const labels = chosen.map((id) => q.options.find((o) => o.id === id)!.label);
  const text = answer.freeText?.trim() ?? "";

  if (answer.delegate) {
    // Klingit takes the data-backed option when there is one, else decides later. Not asked again either way.
    const pick = q.recommendedOptionIds.map((id) => q.options.find((o) => o.id === id)).filter((o): o is QuestionOption => Boolean(o));
    const current = getSection(sections, q.key);
    const picked = { key: q.key, ...valueFor(q, pick.map((o) => o.id), pick.map((o) => o.label), "", ctx) } as BriefSection;
    const kept: Pick<BriefSection, "value" | "items" | "refs"> = sectionFilled(picked) ? picked : current && sectionFilled(current) ? current : { value: "Klingit decides" };
    const delegated: BriefSection = { key: q.key, value: kept.value, items: kept.items, refs: kept.refs, source: "suggested", sourceRef: null, editedByClient: false, delegated: true };
    return [...sections.filter((s) => s.key !== q.key), delegated];
  }

  const patch = valueFor(q, chosen, labels, text, ctx);
  return setClientSection(sections, q.key, patch);
}

function valueFor(q: StudioQuestion, ids: string[], labels: string[], text: string, ctx: PlannerContext): Omit<BriefSection, "key" | "source" | "editedByClient"> {
  switch (q.key) {
    case "objective":
      return { value: text || OBJECTIVE_TEXT[ids[0]] || labels[0] || "" };
    case "deliverables": {
      const typed = text ? text.split(/,|\band\b/).map((t) => t.trim()).filter(Boolean).map((t) => formatForLabel(t)?.label ?? t) : [];
      return { value: "", items: [...new Set([...labels, ...typed])] };
    }
    case "markets": {
      const typed = text ? (parseMarkets(text).length ? parseMarkets(text) : [text]) : [];
      return { value: "", items: [...new Set([...labels, ...typed])] };
    }
    case "deadline": {
      const d = text ? parseDeadline(text) : fromIsoDay(ids[0] ?? "");
      return { value: d ? isoDay(d) : "" };
    }
    case "mustHaves": {
      const items = [...labels, ...(text ? [text] : [])];
      return { value: "", items: items.includes("Nothing specific") ? ["None"] : items };
    }
    case "references": {
      if (ids.includes("none") && !text) return { value: "None", refs: [] };
      const refs = ids
        .map((id) => ctx.topAssets.find((a) => a.id === id))
        .filter((a): a is TopAsset => Boolean(a))
        .map((a) => ({ kind: "asset" as const, id: a.id, label: a.name, sub: `${pct(a.ctr)} CTR · ${a.format}` }));
      return { value: text, refs };
    }
    case "budget": {
      if (text) return { value: text.match(/\d+/)?.[0] ?? text };
      const id = ids[0] ?? "";
      return { value: id.startsWith("credits:") ? id.slice(8) : id === "flexible" ? "flexible" : "" };
    }
    default:
      return { value: text || labels.join(", ") };
  }
}
