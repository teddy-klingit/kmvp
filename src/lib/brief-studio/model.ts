/**
 * Brief studio (BriefStudioBalanced.dc.html, BriefStudioEnd.dc.html): the brief is a set of typed slots, each
 * with where its value came from. A brief is ready when a designer or an agent could start without asking
 * anything. Pure types and definitions only, shared by the server (studio.ts) and the studio UI.
 */

export type SectionKey =
  // Essentials
  | "deliverables"
  | "whyNow"
  | "objective"
  | "audience"
  | "keyMessage"
  | "proofOffer"
  | "cta"
  | "material"
  | "deadline"
  | "markets"
  | "languages"
  // Nice-to-haves
  | "mustInclude"
  | "mustAvoid"
  | "references"
  | "competitorExamples"
  | "approver"
  | "feedbackRounds"
  | "budgetCeiling"
  // Brand OS and the agent's own
  | "tone"
  | "task"
  | "notes";

/** brandOS = read from Brand OS; answer = the client said or chose it; suggested = the agent's proposal or inference; pastProject = from an earlier project. */
export type SectionSource = "brandOS" | "answer" | "suggested" | "pastProject";

export type BriefRef = { kind: "asset" | "file" | "link"; label: string; sub?: string; url?: string; id?: string };

/** One typed field per slot. The section's `value` is the readable text; `data` is what the logic reads. */
export type SlotData = {
  deliverables: { channels: string[]; formats: string[]; ideasCount: number | null };
  whyNow: { reason: string };
  objective: { goal: string; metric: string | null; target: string | null; compareToProjectId: string | null; compareToName: string | null };
  audience: { personaId: string | null; personaName: string | null; description: string; barrier: string | null };
  keyMessage: { text: string };
  proofOffer: { text: string; needsLegalLine: boolean | null };
  cta: { action: string; destination: string | null };
  material: { clientProvides: string | null; klingitMakes: string | null; needsShoot: boolean };
  deadline: { iso: string };
  markets: { names: string[] };
  languages: { names: string[] };
  mustInclude: { items: string[] };
  mustAvoid: { items: string[] };
  references: { refs: BriefRef[] };
  competitorExamples: { items: string[] };
  approver: { name: string };
  feedbackRounds: { count: number };
  budgetCeiling: { credits: number };
  tone: { text: string };
  task: { sentence: string; meta: string };
  notes: { text: string };
};

export type BriefSection<K extends SectionKey = SectionKey> = {
  key: K;
  /** The readable text shown on the canvas ("" when not set). */
  value: string;
  /** List sections (markets, languages, must include/avoid) also keep their items here. */
  items?: string[];
  refs?: BriefRef[];
  data?: Partial<SlotData[K]>;
  source: SectionSource;
  /** The past project (or Brand OS persona) a value came from. */
  sourceRef?: { id: string; name: string } | null;
  /** Set by any client edit or answer: the agent never overwrites it. */
  editedByClient: boolean;
  /** "Let Klingit decide": answered by delegating, so it isn't asked again. */
  delegated?: boolean;
  /** An inference sure enough to just show with its tag (no confirm question). */
  confident?: boolean;
};

export type QuestionType = "single" | "multi" | "date" | "text" | "confirm" | "closing";
export type QuestionOption = { id: string; label: string; group?: string };

export type StudioQuestion = {
  id: string;
  key: SectionKey;
  /** Which part of the slot it fills: "channels", "formats", "barrier", … ("" = the whole slot). */
  part: string;
  question: string;
  hint?: string;
  type: QuestionType;
  options: QuestionOption[];
  /** Only ever options backed by real data (reasonPerOption says which data). */
  recommendedOptionIds: string[];
  /** Real data shown under an option ("7.4% CTR last time"); options without data have no entry. */
  reasonPerOption: Record<string, string>;
  /** A line under the chips ("Changes the estimate, shown on the right"). */
  footnote?: string;
  /** Asked because the client clicked "Make it great" or a closing chip, not by the agent's plan. */
  requested?: boolean;
  askedAt: string;
  answeredAt?: string;
  chosen?: string[];
  freeText?: string;
  delegated?: boolean;
};

export type StudioMessage = {
  id: string;
  role: "client" | "agent";
  text: string;
  at: string;
  authorName?: string;
  /** Agent message that carries a question (rendered with its chips). */
  questionId?: string;
};

/** Facts about the brand record that brand fit reads. */
export type BrandFacts = { voice: boolean; visual: boolean; linkedSources: number };

/** The agent asks at most this many questions, plus the closing one. */
export const HARD_QUESTION_CEILING = 8;

export const ESSENTIAL_KEYS: SectionKey[] = ["deliverables", "whyNow", "objective", "audience", "keyMessage", "proofOffer", "cta", "material", "deadline"];

/** The canvas (BriefStudioEnd.dc.html), in order. Deadline, markets and languages share one card. */
export const SECTION_LABEL: Record<SectionKey, string> = {
  task: "The task",
  deliverables: "What we're making",
  whyNow: "Why now",
  objective: "Objective and how we measure it",
  audience: "Audience and what holds them back",
  keyMessage: "One thing to remember",
  proofOffer: "Proof and offer",
  cta: "Call to action",
  material: "Material",
  mustInclude: "Must include",
  mustAvoid: "Must avoid",
  approver: "Approval",
  feedbackRounds: "Approval",
  tone: "Tone & brand",
  references: "References",
  competitorExamples: "Competitor examples",
  deadline: "Deadline & markets",
  markets: "Markets",
  languages: "Languages",
  budgetCeiling: "Budget",
  notes: "Notes",
};

export function sectionFilled(s: BriefSection | undefined) {
  if (!s) return false;
  return Boolean(s.value.trim()) || Boolean(s.items?.length) || Boolean(s.refs?.length);
}

export function getSection<K extends SectionKey>(sections: BriefSection[], key: K): BriefSection<K> | undefined {
  return sections.find((s) => s.key === key) as BriefSection<K> | undefined;
}

export function slot<K extends SectionKey>(sections: BriefSection[], key: K): Partial<SlotData[K]> {
  return (getSection(sections, key)?.data ?? {}) as Partial<SlotData[K]>;
}

/** The client's own value: tagged "answer" and protected from the agent from now on. */
export function setClientSection<K extends SectionKey>(sections: BriefSection[], key: K, patch: Partial<Omit<BriefSection<K>, "key">>): BriefSection[] {
  const current = getSection(sections, key);
  const next = {
    key,
    value: "",
    ...current,
    ...patch,
    data: { ...(current?.data ?? {}), ...(patch.data ?? {}) },
    source: "answer",
    sourceRef: null,
    editedByClient: true,
    delegated: false,
  } as BriefSection;
  return [...sections.filter((s) => s.key !== key), next];
}

/** The agent's proposals: never replace a client edit or anything the client said. */
export function mergeAgentSections(sections: BriefSection[], proposals: BriefSection[]): BriefSection[] {
  let out = [...sections];
  for (const p of proposals) {
    const current = getSection(out, p.key);
    if (current && (current.editedByClient || (current.source === "answer" && sectionFilled(current)))) continue;
    if (!sectionFilled(p)) continue;
    out = [...out.filter((s) => s.key !== p.key), { ...p, editedByClient: false }];
  }
  return out;
}

export function newId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
