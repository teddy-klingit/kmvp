import {
  getSection,
  HARD_QUESTION_CEILING,
  newId,
  sectionFilled,
  setClientSection,
  slot,
  type BriefSection,
  type QuestionOption,
  type SectionKey,
  type StudioQuestion,
} from "@/lib/brief-studio/model";
import { CHANNEL_GROUPS, CLOSING, CLOSING_FOLLOW_UP, QUESTION_BANK, formatsForChannels, type DeliverableKind } from "@/lib/brief-studio/question-bank";

/**
 * The brief agent's questions (README: "the question framework"). One at a time, in this order: what's being made
 * (channel first, then formats) → why now → objective → audience and what holds them back → the one thing to
 * remember → proof and offer → call to action → material, then always the closing "Anything else they should
 * know?". Anything known (Basics, Brand OS, past projects, the first message) is skipped; an inference becomes a
 * confirm question. Basics (deadline, markets, languages) are never asked. At most 8 questions plus the closing one.
 * Chips carry real data only.
 */

export type FormatStat = { formatId: string; ctr: number; projectName: string };

export type PlannerContext = {
  kind: DeliverableKind;
  brandName: string;
  /** Latest measured CTR per bank format, from the client's own delivered assets. */
  formatStats: FormatStat[];
  /** Channels of the most similar past project (the "Recommended" channel). */
  pastChannels: { channels: string[]; projectName: string } | null;
  personas: { name: string; description: string }[];
  /** The agent's single-minded message proposals (or Brand OS USPs). */
  keyMessageOptions: string[];
  /** What holds people back; `reason` only when real data backs it. */
  barrierOptions: { label: string; reason: string | null }[];
  proofOptions: string[];
  /** The past project to compare results with. */
  compareTo: { id: string; name: string } | null;
  website: string | null;
};

export type Part = "channels" | "formats" | "whyNow" | "objective" | "persona" | "barrier" | "keyMessage" | "proofOffer" | "cta" | "material";
const PLAN: Part[] = ["channels", "formats", "whyNow", "objective", "persona", "barrier", "keyMessage", "proofOffer", "cta", "material"];
const PART_KEY: Record<Part, SectionKey> = { channels: "deliverables", formats: "deliverables", whyNow: "whyNow", objective: "objective", persona: "audience", barrier: "audience", keyMessage: "keyMessage", proofOffer: "proofOffer", cta: "cta", material: "material" };

/** Never asked: they come from Basics. */
export const BASICS: SectionKey[] = ["deadline", "markets", "languages"];

const unconfirmed = (s: BriefSection | undefined) => Boolean(s && s.source === "suggested" && !s.editedByClient && !s.delegated && !s.confident);

/** Goals whose call to action is certain enough to show without asking (an app install means the app stores). */
export const CONFIDENT_CTA: Record<string, string> = { installs: "install" };

/** Whether the agent still has to ask this part (empty, or an inference waiting to be confirmed). */
export function needsAsking(sections: BriefSection[], part: Part, ctx: Pick<PlannerContext, "kind" | "personas">): boolean {
  const bank = QUESTION_BANK[ctx.kind];
  const s = getSection(sections, PART_KEY[part]);
  if (s?.delegated) return false;
  const d = slot(sections, "deliverables");
  const a = slot(sections, "audience");
  switch (part) {
    case "channels":
      return bank.channels.length > 0 && !d.channels?.length;
    case "formats":
      // A format suggested from past CTR is still asked: it's the client's call.
      return !d.formats?.length || unconfirmed(s);
    case "objective":
      return !slot(sections, "objective").goal || unconfirmed(s);
    case "persona":
      // One persona in Brand OS is confident enough to just show; several get a confirm question.
      return !(a.personaName || a.description) || (unconfirmed(s) && ctx.personas.length > 1 && !a.barrier);
    case "barrier":
      return !a.barrier;
    case "keyMessage":
    case "cta":
      return !sectionFilled(s) || unconfirmed(s);
    default:
      return !sectionFilled(s);
  }
}

export const agentQuestionsAsked = (log: StudioQuestion[]) => log.filter((q) => !q.requested && q.type !== "closing").length;
export const activeQuestion = (log: StudioQuestion[]) => log.find((q) => !q.answeredAt) ?? null;

/** What the agent still plans to ask, in order. */
export function plannedParts(sections: BriefSection[], ctx: Pick<PlannerContext, "kind" | "personas">) {
  return PLAN.filter((p) => needsAsking(sections, p, ctx));
}

/** The next step: a part to ask, the closing question, or nothing (done). */
export function nextStep(sections: BriefSection[], log: StudioQuestion[], ctx: Pick<PlannerContext, "kind" | "personas">): Part | "closing" | null {
  if (log.some((q) => q.type === "closing" && q.chosen?.includes("done"))) return null;
  const planned = plannedParts(sections, ctx);
  if (planned.length && agentQuestionsAsked(log) < HARD_QUESTION_CEILING) return planned[0];
  return "closing";
}

/** "About N questions": essentials still to ask that can't be inferred, capped by the ceiling. The closing one isn't counted. */
export function questionsLeft(sections: BriefSection[], log: StudioQuestion[], ctx: Pick<PlannerContext, "kind" | "personas">) {
  const active = activeQuestion(log);
  const room = HARD_QUESTION_CEILING - agentQuestionsAsked(log) + (active && !active.requested && active.type !== "closing" ? 1 : 0);
  return Math.max(0, Math.min(room, plannedParts(sections, ctx).length)) + (active?.requested ? 1 : 0);
}

// ─── Building one question ─────────────────────────────────────────────────

const pct = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

export function buildQuestion(part: Part, sections: BriefSection[], ctx: PlannerContext, opts: { now?: Date } = {}): StudioQuestion {
  const bank = QUESTION_BANK[ctx.kind];
  const base = { id: newId("q"), key: PART_KEY[part], part, askedAt: (opts.now ?? new Date()).toISOString() };
  const none = { recommendedOptionIds: [] as string[], reasonPerOption: {} as Record<string, string> };

  switch (part) {
    case "channels": {
      const groups = CHANNEL_GROUPS.map((g) => ({ ...g, channels: g.channels.filter((c) => bank.channels.includes(c)) })).filter((g) => g.channels.length);
      const options: QuestionOption[] = groups.flatMap((g) => g.channels.map((c) => ({ id: c, label: c, group: groups.length > 1 ? g.group : undefined })));
      const past = ctx.pastChannels?.channels.filter((c) => options.some((o) => o.id === c)) ?? [];
      return { ...base, question: `Where will the ${bank.noun} run?`, hint: "Pick any", type: "multi", options, recommendedOptionIds: past, reasonPerOption: Object.fromEntries(past.map((c) => [c, `Used in ${ctx.pastChannels!.projectName}`])) };
    }
    case "formats": {
      const channels = slot(sections, "deliverables").channels ?? [];
      const formats = formatsForChannels(channels.length ? channels : bank.fixedChannel ? [bank.fixedChannel] : ["Meta"]);
      const reason: Record<string, string> = {};
      const withData = formats.map((f) => ({ f, stat: ctx.formatStats.find((s) => s.formatId === f.id) })).filter((x) => x.stat);
      const best = [...withData].sort((a, b) => b.stat!.ctr - a.stat!.ctr)[0];
      for (const { f, stat } of withData) reason[f.id] = f.id === best?.f.id ? `${pct(stat!.ctr)} CTR last time` : `${pct(stat!.ctr)} CTR`;
      return {
        ...base,
        question: "Which formats?",
        hint: channels.length > 1 ? `For ${channels.join(" and ")} · pick any` : "Pick any",
        type: "multi",
        options: formats.map((f) => ({ id: f.id, label: f.label, group: channels.length > 1 ? f.channel : undefined })),
        recommendedOptionIds: best ? [best.f.id] : [],
        reasonPerOption: reason,
      };
    }
    case "whyNow":
      return { ...base, question: bank.whyNow.question, type: "single", options: bank.whyNow.options, ...none };
    case "objective":
      return { ...base, question: bank.objective.question, type: "single", options: bank.objective.options, ...none };
    case "persona": {
      if (ctx.personas.length > 1) {
        const first = ctx.personas[0];
        return { ...base, question: `I'm assuming ${first.name}, right?`, hint: first.description, type: "confirm", options: ctx.personas.map((p, i) => ({ id: `p${i}`, label: i === 0 ? `Yes, ${p.name}` : p.name })), ...none };
      }
      return {
        ...base,
        question: "Who is it for?",
        type: "single",
        options: [
          { id: "existing", label: "Existing customers" },
          { id: "new", label: "New customers" },
          { id: "young", label: "Gen Z, 18–24" },
          { id: "b2b", label: "Business buyers" },
        ],
        ...none,
      };
    }
    case "barrier": {
      const options = ctx.barrierOptions.slice(0, 4).map((b) => ({ id: slug(b.label), label: b.label }));
      const backed = ctx.barrierOptions.slice(0, 4).filter((b) => b.reason);
      return {
        ...base,
        question: bank.barrier.question.replace("{brand}", ctx.brandName),
        hint: bank.barrier.hint,
        type: options.length ? "single" : "text",
        options,
        recommendedOptionIds: backed.slice(0, 1).map((b) => slug(b.label)),
        reasonPerOption: Object.fromEntries(backed.map((b) => [slug(b.label), b.reason!])),
      };
    }
    case "keyMessage": {
      const options = ctx.keyMessageOptions.slice(0, 3).map((m, i) => ({ id: `m${i}`, label: m }));
      return { ...base, question: bank.keyMessage.question, hint: options.length ? bank.keyMessage.hint : "Write it in your own words", type: options.length ? "single" : "text", options, ...none };
    }
    case "proofOffer": {
      const options = ctx.proofOptions.slice(0, 3).map((m, i) => ({ id: `o${i}`, label: m }));
      return { ...base, question: bank.proofOffer.question, hint: bank.proofOffer.hint, type: options.length ? "single" : "text", options, ...none };
    }
    case "cta": {
      const inferred = getSection(sections, "cta");
      if (inferred && unconfirmed(inferred)) {
        const others = bank.cta.options.filter((o) => o.label !== slot(sections, "cta").action);
        return { ...base, question: `I'm assuming “${inferred.value}”, right?`, type: "confirm", options: [{ id: "yes", label: "Yes" }, ...others], ...none };
      }
      return { ...base, question: bank.cta.question, type: "single", options: bank.cta.options, ...none };
    }
    case "material":
      return { ...base, question: bank.material.question, type: "single", options: bank.material.options, footnote: bank.material.footnote, ...none };
  }
}

export function closingQuestion(now = new Date()): StudioQuestion {
  return {
    id: newId("q"),
    key: "notes",
    part: "closing",
    question: CLOSING.question,
    type: "closing",
    options: [...CLOSING.options, { id: "done", label: CLOSING.done }],
    recommendedOptionIds: [],
    reasonPerOption: {},
    askedAt: now.toISOString(),
  };
}

/** A closing chip's short follow-up (or the same question from "Make it great"). */
export function followUpQuestion(id: keyof typeof CLOSING_FOLLOW_UP, now = new Date()): StudioQuestion {
  const f = CLOSING_FOLLOW_UP[id];
  return { id: newId("q"), key: f.key, part: id, question: f.question, hint: f.hint, type: "text", options: [], recommendedOptionIds: [], reasonPerOption: {}, requested: true, askedAt: now.toISOString() };
}

// ─── Applying an answer ────────────────────────────────────────────────────

export type Answer = { chosen?: string[]; freeText?: string; delegate?: boolean };

const and = (l: string[]) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}` : l[0] ?? "");

/** "Think it is only for big purchases" → "Thinks it is only for big purchases" (the persona is singular). */
export function thirdPerson(s: string) {
  return s
    .replace(/^Think\b/, "Thinks")
    .replace(/^Worry\b/, "Worries")
    .replace(/^Do not\b/, "Doesn't")
    .replace(/^Don't\b/, "Doesn't")
    .replace(/^Prefer\b/, "Prefers")
    .replace(/^Feel\b/, "Feels")
    .replace(/^Believe\b/, "Believes")
    .replace(/^Have\b/, "Has");
}

export function deliverablesText(d: { channels?: string[]; formats?: string[]; ideasCount?: number | null }) {
  const made = [d.ideasCount ? `${d.ideasCount} idea${d.ideasCount === 1 ? "" : "s"}` : null, d.formats?.length ? and(d.formats) : null].filter(Boolean).join(" × ");
  return [made, d.channels?.length ? `for ${and(d.channels)}` : null].filter(Boolean).join(" ");
}

export function audienceText(a: { personaName?: string | null; description?: string; barrier?: string | null }) {
  const who = [a.personaName, a.description].filter(Boolean).join(", ");
  return [who ? `${who.replace(/\.$/, "")}.` : "", a.barrier ? `${thirdPerson(a.barrier).replace(/\.$/, "")}.` : ""].filter(Boolean).join(" ");
}

const CTA_DESTINATION: Record<string, (website: string | null) => string | null> = {
  install: () => "App Store and Google Play",
  download: () => "App Store and Google Play",
  shop: (w) => w,
  buy: (w) => w,
  signup: (w) => w,
  visit: (w) => w,
};
export const ctaDestination = (id: string, website: string | null) => CTA_DESTINATION[id]?.(website) ?? null;

export function legalLineNeeded(text: string) {
  return /interest|\bfees?\b|\brates?\b|%|apr|pay in \d|credit|loan|installments?/i.test(text);
}

/** Writes the client's answer (or "Let Klingit decide") into its slot. */
export function applyAnswer(sections: BriefSection[], q: StudioQuestion, answer: Answer, ctx: PlannerContext): BriefSection[] {
  const bank = QUESTION_BANK[ctx.kind];
  const ids = (answer.chosen ?? []).filter((id) => q.options.some((o) => o.id === id));
  const labels = ids.map((id) => q.options.find((o) => o.id === id)!.label);
  const text = answer.freeText?.trim() ?? "";

  if (answer.delegate) {
    const current = getSection(sections, q.key);
    const keep = current && sectionFilled(current) ? current : null;
    // Klingit takes the data-backed option when there is one.
    const rec = q.recommendedOptionIds.map((id) => q.options.find((o) => o.id === id)!.label);
    const next: BriefSection = keep
      ? { ...keep, source: "suggested", delegated: true, editedByClient: false }
      : { key: q.key, value: rec[0] ?? "Klingit decides", source: "suggested", editedByClient: false, delegated: true };
    if (q.part === "channels" && rec.length) next.data = { ...(keep?.data ?? {}), channels: rec, formats: [], ideasCount: 3 } as never;
    return [...sections.filter((s) => s.key !== q.key), next];
  }

  const d = slot(sections, "deliverables");
  const a = slot(sections, "audience");
  switch (q.part) {
    case "channels": {
      const channels = [...new Set([...labels, ...(text ? [text] : [])])];
      const formats = (d.formats ?? []).filter((f) => formatsForChannels(channels).some((x) => x.label === f));
      const data = { channels, formats, ideasCount: d.ideasCount ?? 3 };
      return setClientSection(sections, "deliverables", { value: deliverablesText(data), data });
    }
    case "formats": {
      const formats = [...new Set([...labels, ...(text ? text.split(/,|\band\b/).map((t) => t.trim()).filter(Boolean) : [])])];
      const data = { channels: d.channels?.length ? d.channels : bank.fixedChannel ? [bank.fixedChannel] : [], formats, ideasCount: d.ideasCount ?? 3 };
      return setClientSection(sections, "deliverables", { value: deliverablesText(data), data });
    }
    case "whyNow": {
      const reason = text || labels[0] || "";
      return setClientSection(sections, "whyNow", { value: reason, data: { reason } });
    }
    case "objective": {
      const id = ids[0];
      const goal = text || bank.objective.options.find((o) => o.id === id)?.label || labels[0] || "";
      const metric = id ? bank.objective.metricFor[id] ?? null : null;
      const compare = metric && ctx.compareTo ? ctx.compareTo : null;
      const value = [goal.replace(/\.$/, ""), metric ? `Success = ${metric}${compare ? ` than ${compare.name}` : ""}` : null].filter(Boolean).join(". ") + ".";
      let next = setClientSection(sections, "objective", { value, data: { goal, metric, target: null, compareToProjectId: compare?.id ?? null, compareToName: compare?.name ?? null } });
      // The call to action follows from the goal: shown when it's certain, confirmed when it's a guess.
      const ctaId = id ? (CONFIDENT_CTA[id] ?? ({ sales: "shop", signups: "signup" } as Record<string, string>)[id]) : undefined;
      const opt = ctaId ? bank.cta.options.find((o) => o.id === ctaId) : undefined;
      if (opt && !sectionFilled(getSection(next, "cta"))) {
        const destination = ctaDestination(opt.id, ctx.website);
        next = [...next, { key: "cta", value: [opt.label, destination].filter(Boolean).join(" · "), data: { action: opt.label, destination }, source: "suggested", editedByClient: false, confident: Boolean(CONFIDENT_CTA[id!]) }];
      }
      return next;
    }
    case "persona": {
      const i = ids[0]?.startsWith("p") ? Number(ids[0].slice(1)) : -1;
      const persona = i >= 0 ? ctx.personas[i] : null;
      const data = persona
        ? { ...a, personaId: `p${i}`, personaName: persona.name, description: persona.description }
        : { ...a, personaId: null, personaName: null, description: text || labels[0] || "" };
      return setClientSection(sections, "audience", { value: audienceText(data), data });
    }
    case "barrier": {
      const data = { ...a, barrier: text || labels[0] || "" };
      return setClientSection(sections, "audience", { value: audienceText(data), data });
    }
    case "keyMessage": {
      const t = text || labels[0] || "";
      return setClientSection(sections, "keyMessage", { value: t, data: { text: t } });
    }
    case "proofOffer": {
      const t = text || labels[0] || "";
      const legal = legalLineNeeded(t);
      return setClientSection(sections, "proofOffer", { value: legal ? `${t.replace(/\.$/, "")}. Legal line required per market.` : t, data: { text: t, needsLegalLine: legal } });
    }
    case "cta": {
      const confirmed = ids[0] === "yes" ? slot(sections, "cta") : null;
      const opt = bank.cta.options.find((o) => o.id === ids[0]);
      const action = confirmed?.action ?? (text || opt?.label || labels[0] || "");
      const destination = confirmed ? confirmed.destination ?? null : opt ? ctaDestination(opt.id, ctx.website) : null;
      return setClientSection(sections, "cta", { value: [action, destination].filter(Boolean).join(" · "), data: { action, destination } });
    }
    case "material": {
      const id = ids[0];
      const data = { clientProvides: id === "client" ? [labels[0], text].filter(Boolean).join(": ") : !id && text ? text : null, klingitMakes: id === "klingit" || id === "shoot" ? labels[0] : null, needsShoot: id === "shoot" };
      return setClientSection(sections, "material", { value: [labels[0], text].filter(Boolean).join(": "), data });
    }
    // Closing follow-ups.
    case "avoid": {
      const items = [...(getSection(sections, "mustAvoid")?.items ?? []), text].filter(Boolean);
      return setClientSection(sections, "mustAvoid", { value: "", items, data: { items } });
    }
    case "competitor": {
      const items = [...(getSection(sections, "competitorExamples")?.items ?? []), text].filter(Boolean);
      return setClientSection(sections, "competitorExamples", { value: "", items, data: { items } });
    }
    case "legal": {
      const proof = slot(sections, "proofOffer");
      const base = (proof.text ?? getSection(sections, "proofOffer")?.value ?? "").replace(/\.$/, "");
      return setClientSection(sections, "proofOffer", { value: [base, `Legal checks: ${text.replace(/\.$/, "")}`].filter(Boolean).join(". ") + ".", data: { text: base, needsLegalLine: true } });
    }
    case "approver": {
      const rounds = text.match(/(\d+)\s*rounds?/i);
      const name = text.replace(/,?\s*\d+\s*rounds?.*/i, "").trim() || text;
      let next = setClientSection(sections, "approver", { value: name, data: { name } });
      if (rounds) next = setClientSection(next, "feedbackRounds", { value: `${rounds[1]} rounds of feedback`, data: { count: Number(rounds[1]) } });
      return next;
    }
    default:
      return setClientSection(sections, q.key, { value: text || labels.join(", ") });
  }
}
