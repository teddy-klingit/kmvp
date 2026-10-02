import { getSection, sectionFilled, slot, type BrandFacts, type BriefSection, type SectionKey } from "@/lib/brief-studio/model";

/**
 * Brief quality, 0–100: deterministic points per filled slot (never an AI guess). The 9 essentials make 50; the
 * 10 nice-to-haves make up to 50 more. Until every essential is in, the score stays under the Essentials marker
 * (49 at most). Great is 80 or more: a designer can start from it.
 */

export type Essential = "deliverables" | "whyNow" | "objective" | "audience" | "keyMessage" | "proofOffer" | "cta" | "material" | "deadline";
export type NiceToHave = "tone" | "references" | "competitorExamples" | "mustInclude" | "mustAvoid" | "approver" | "feedbackRounds" | "target" | "legalChecked" | "budgetCeiling";

export const ESSENTIAL_POINTS: Record<Essential, number> = { deliverables: 8, whyNow: 4, objective: 7, audience: 7, keyMessage: 6, proofOffer: 5, cta: 5, material: 4, deadline: 4 };
export const NICE_POINTS = 5;
export const NICE_TO_HAVES: NiceToHave[] = ["tone", "references", "competitorExamples", "mustInclude", "mustAvoid", "approver", "feedbackRounds", "target", "legalChecked", "budgetCeiling"];

/** "Make it great": the nice-to-haves a question can fill, with the section it lands in. */
const ASKABLE: Partial<Record<NiceToHave, { key: SectionKey; label: string }>> = {
  mustAvoid: { key: "mustAvoid", label: "Say what to avoid" },
  competitorExamples: { key: "competitorExamples", label: "Add a competitor example" },
  approver: { key: "approver", label: "Name who signs off" },
  references: { key: "references", label: "Add a reference" },
  mustInclude: { key: "mustInclude", label: "Add must-haves" },
  target: { key: "objective", label: "Set a target" },
  legalChecked: { key: "proofOffer", label: "Check the legal line" },
};

export type QualitySuggestion = { key: SectionKey; label: string; points: number; nice: NiceToHave };

export type BriefQuality = {
  score: number;
  label: "Needs more" | "Good" | "Great";
  essentialsCovered: boolean;
  essentialsDone: number;
  missingEssentials: Essential[];
  niceDone: number;
  /** Points per essential (partial when only part of a slot is in). */
  essentials: Record<Essential, number>;
  nice: Record<NiceToHave, boolean>;
  suggestions: QualitySuggestion[];
  /** "Great · a designer can start from this". */
  status: string;
  /** "All 9 essentials covered · 8 of 10 nice-to-haves". */
  detail: string;
};

export function qualityLabel(score: number): BriefQuality["label"] {
  return score >= 80 ? "Great" : score >= 50 ? "Good" : "Needs more";
}

const has = (s: string | null | undefined) => Boolean(s && s.trim());

/** Points each essential earns: full when every part a designer needs is there, partial for some. */
function essentialPoints(sections: BriefSection[]): Record<Essential, number> {
  const p = ESSENTIAL_POINTS;
  const deliverables = slot(sections, "deliverables");
  const objective = slot(sections, "objective");
  const audience = slot(sections, "audience");
  const filled = (k: SectionKey) => sectionFilled(getSection(sections, k));
  const channels = (deliverables.channels?.length ?? 0) > 0;
  const formats = (deliverables.formats?.length ?? 0) > 0;
  const deadline = filled("deadline");
  const markets = (getSection(sections, "markets")?.items?.length ?? 0) > 0;
  return {
    deliverables: channels && formats ? p.deliverables : channels || formats || filled("deliverables") ? p.deliverables / 2 : 0,
    whyNow: filled("whyNow") ? p.whyNow : 0,
    objective: has(objective.goal) && has(objective.metric) ? p.objective : has(objective.goal) || filled("objective") ? 4 : 0,
    audience: (has(audience.description) || has(audience.personaName)) && has(audience.barrier) ? p.audience : has(audience.description) || has(audience.personaName) || filled("audience") ? 4 : 0,
    keyMessage: filled("keyMessage") ? p.keyMessage : 0,
    proofOffer: filled("proofOffer") ? p.proofOffer : 0,
    cta: filled("cta") ? p.cta : 0,
    material: filled("material") ? p.material : 0,
    deadline: deadline && markets ? p.deadline : deadline || markets ? p.deadline / 2 : 0,
  };
}

export function briefQuality(input: { sections: BriefSection[]; brand: BrandFacts }): BriefQuality {
  const { sections, brand } = input;
  const filled = (k: SectionKey) => sectionFilled(getSection(sections, k));
  const essentials = essentialPoints(sections);
  const missingEssentials = (Object.keys(ESSENTIAL_POINTS) as Essential[]).filter((k) => essentials[k] < ESSENTIAL_POINTS[k]);

  const objective = slot(sections, "objective");
  const proof = slot(sections, "proofOffer");
  const nice: Record<NiceToHave, boolean> = {
    tone: filled("tone") && ((brand.voice && brand.visual) || brand.linkedSources > 0 || getSection(sections, "tone")?.source === "answer"),
    references: filled("references"),
    competitorExamples: filled("competitorExamples"),
    mustInclude: filled("mustInclude"),
    mustAvoid: filled("mustAvoid"),
    approver: filled("approver"),
    feedbackRounds: filled("feedbackRounds"),
    target: has(objective.target) || has(objective.compareToProjectId) || /\d/.test(objective.metric ?? ""),
    legalChecked: proof.needsLegalLine === true || proof.needsLegalLine === false,
    budgetCeiling: filled("budgetCeiling"),
  };
  const niceDone = NICE_TO_HAVES.filter((n) => nice[n]).length;

  const total = Math.min(100, Math.round(Object.values(essentials).reduce((a, b) => a + b, 0) + niceDone * NICE_POINTS));
  const essentialsCovered = missingEssentials.length === 0;
  const score = essentialsCovered ? total : Math.min(total, 49);
  const label = qualityLabel(score);

  const suggestions = NICE_TO_HAVES.filter((n) => !nice[n] && ASKABLE[n])
    .map((n) => ({ key: ASKABLE[n]!.key, label: ASKABLE[n]!.label, points: NICE_POINTS, nice: n }))
    .slice(0, 2);

  const essentialsDone = 9 - missingEssentials.length;
  const status = label === "Great" ? "Great · a designer can start from this" : essentialsCovered ? "Good · essentials covered" : `Needs more · ${missingEssentials.length} essential${missingEssentials.length === 1 ? "" : "s"} missing`;
  const detail = `${essentialsCovered ? "All 9 essentials covered" : `${essentialsDone} of 9 essentials`} · ${niceDone} of 10 nice-to-haves`;

  return { score, label, essentialsCovered, essentialsDone, missingEssentials, niceDone, essentials, nice, suggestions, status, detail };
}
