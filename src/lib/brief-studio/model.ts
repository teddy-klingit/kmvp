/**
 * Brief studio (BriefStudioBalanced.dc.html): the brief is a list of sections, each with where its value came
 * from. Pure types and definitions only, shared by the server (studio.ts) and the studio UI.
 */

export type SectionKey =
  | "objective"
  | "audience"
  | "deliverables"
  | "keyMessage"
  | "tone"
  | "references"
  | "deadline"
  | "markets"
  | "successMetric"
  | "mustHaves"
  | "budget"
  | "notes";

/** brandOS = read from Brand OS; answer = the client said or chose it; suggested = the agent's proposal; pastProject = copied from one of the client's earlier projects. */
export type SectionSource = "brandOS" | "answer" | "suggested" | "pastProject";

export type BriefRef = { kind: "asset" | "file" | "link"; label: string; sub?: string; url?: string; id?: string };

export type BriefSection = {
  key: SectionKey;
  /** The text value. Dates are ISO days (deadline), budgets a credit number as text, or "" when not set. */
  value: string;
  /** List sections: formats, markets, must-haves. */
  items?: string[];
  refs?: BriefRef[];
  source: SectionSource;
  /** The past project (or Brand OS persona) a value came from. */
  sourceRef?: { id: string; name: string } | null;
  /** Set by any client edit or answer: the agent never overwrites it. */
  editedByClient: boolean;
  /** "Let Klingit decide": answered by delegating, so it isn't asked again. */
  delegated?: boolean;
};

export type QuestionType = "single" | "multi" | "date" | "text";
export type QuestionOption = { id: string; label: string };

export type StudioQuestion = {
  id: string;
  key: SectionKey;
  question: string;
  hint?: string;
  type: QuestionType;
  options: QuestionOption[];
  /** Only ever options backed by real data (reasonPerOption says which data). */
  recommendedOptionIds: string[];
  /** Real data shown under an option ("7.4% CTR last time"); options without data have no entry. */
  reasonPerOption: Record<string, string>;
  /** Asked because the client clicked "Make it great" or "+ more?", not by the agent's own plan. */
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

/** Facts about the brand record that the brand-fit bucket reads. */
export type BrandFacts = { voice: boolean; visual: boolean; linkedSources: number };

export const HARD_QUESTION_CEILING = 8;

/** The canvas, in the design's order. Budget lives in the Basics bar; deadline and markets share one card. */
export const SECTION_LABEL: Record<SectionKey, string> = {
  objective: "Objective",
  audience: "Audience",
  deliverables: "Formats",
  keyMessage: "Key message",
  tone: "Tone & brand",
  references: "References",
  deadline: "Deadline",
  markets: "Markets",
  successMetric: "Success measure",
  mustHaves: "Must-haves",
  budget: "Budget",
  notes: "Notes",
};

export function sectionFilled(s: BriefSection | undefined) {
  if (!s) return false;
  return Boolean(s.value.trim()) || Boolean(s.items?.length) || Boolean(s.refs?.length);
}

export function getSection(sections: BriefSection[], key: SectionKey) {
  return sections.find((s) => s.key === key);
}

/** The client's own value: tagged "answer" and protected from the agent from now on. */
export function setClientSection(sections: BriefSection[], key: SectionKey, patch: Partial<Omit<BriefSection, "key">>): BriefSection[] {
  const next: BriefSection = {
    key,
    value: "",
    ...getSection(sections, key),
    ...patch,
    source: "answer",
    sourceRef: null,
    editedByClient: true,
  };
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
