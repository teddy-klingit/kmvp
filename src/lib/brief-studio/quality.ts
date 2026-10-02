import { getSection, sectionFilled, type BrandFacts, type BriefSection, type SectionKey } from "@/lib/brief-studio/model";

/**
 * Brief quality, 0–100: a pure, deterministic function of what the brief says (never an AI guess).
 *   Essentials 50 · Specificity 20 · References 10 · Brand fit 10 · Constraints 10
 * A brief missing an essential scores at most 49, so passing the Essentials marker means all of them are in.
 */

export const ESSENTIALS: { key: SectionKey; points: number; label: string }[] = [
  { key: "objective", points: 9, label: "Add the objective" },
  { key: "deliverables", points: 9, label: "Pick the formats" },
  { key: "audience", points: 8, label: "Say who it's for" },
  { key: "keyMessage", points: 8, label: "Add a key message" },
  { key: "deadline", points: 8, label: "Set a deadline" },
  { key: "markets", points: 8, label: "Pick the markets" },
];

export type BucketKey = "essentials" | "specificity" | "references" | "brandFit" | "constraints";
export const BUCKET_MAX: Record<BucketKey, number> = { essentials: 50, specificity: 20, references: 10, brandFit: 10, constraints: 10 };

/** A missing piece the client can add by answering one question (so brand fit, which comes from Brand OS, isn't one). */
export type QualitySuggestion = { key: SectionKey; label: string; points: number; bucket: BucketKey };

export type BriefQuality = {
  score: number;
  label: "Needs more" | "Good" | "Great";
  essentialsCovered: boolean;
  missingEssentials: SectionKey[];
  buckets: Record<BucketKey, number>;
  /** "Make it great": up to 2, from the lowest buckets. */
  suggestions: QualitySuggestion[];
  /** "Good · essentials covered", "Needs more · 2 essentials missing". */
  status: string;
};

const NO_KPI = /no (hard )?kpi|quality only|no metric/i;
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

export function qualityLabel(score: number): BriefQuality["label"] {
  return score >= 80 ? "Great" : score >= 50 ? "Good" : "Needs more";
}

export function briefQuality(input: { sections: BriefSection[]; brand: BrandFacts }): BriefQuality {
  const { sections, brand } = input;
  const s = (k: SectionKey) => getSection(sections, k);
  const filled = (k: SectionKey) => sectionFilled(s(k));
  const missing: QualitySuggestion[] = [];

  // Essentials (50)
  let essentials = 0;
  const missingEssentials: SectionKey[] = [];
  for (const e of ESSENTIALS) {
    if (filled(e.key)) essentials += e.points;
    else {
      missingEssentials.push(e.key);
      missing.push({ key: e.key, label: e.label, points: e.points, bucket: "essentials" });
    }
  }

  // Specificity (20): a measurable goal 8, a named persona or segment 6, a key message under 25 words 6.
  let specificity = 0;
  const metric = s("successMetric");
  const objective = s("objective")?.value ?? "";
  const measurable = (sectionFilled(metric) && !NO_KPI.test(metric!.value + (metric!.items ?? []).join(" "))) || /\d/.test(objective);
  if (measurable) specificity += 8;
  else missing.push({ key: "successMetric", label: "Make the goal measurable", points: 8, bucket: "specificity" });
  const audience = s("audience");
  const named = sectionFilled(audience) && (Boolean(audience!.sourceRef) || /persona|segment|aged?\b|\d{2}\s*[–-]\s*\d{2}|\b(gen ?z|millennials|parents|students|shoppers|buyers|customers|users|members)\b/i.test(audience!.value));
  if (named) specificity += 6;
  else if (filled("audience")) missing.push({ key: "audience", label: "Name the persona", points: 6, bucket: "specificity" });
  const message = s("keyMessage");
  if (sectionFilled(message) && words(message!.value) < 25) specificity += 6;
  else if (filled("keyMessage")) missing.push({ key: "keyMessage", label: "Shorten the key message", points: 6, bucket: "specificity" });

  // References (10)
  const references = filled("references") ? 10 : 0;
  if (!references) missing.push({ key: "references", label: "Add a reference", points: 10, bucket: "references" });

  // Brand fit (10): Brand OS voice and visual identity, or linked brand sources; half for one of the two.
  const brandFit = (brand.voice && brand.visual) || brand.linkedSources > 0 ? 10 : brand.voice || brand.visual ? 5 : 0;

  // Constraints (10): a budget the client set 4; must-haves or legal (or an explicit "none") 6.
  let constraints = 0;
  const budget = s("budget");
  if (sectionFilled(budget) && budget!.source === "answer") constraints += 4;
  else missing.push({ key: "budget", label: "Set a budget", points: 4, bucket: "constraints" });
  if (filled("mustHaves")) constraints += 6;
  else missing.push({ key: "mustHaves", label: "Add must-haves", points: 6, bucket: "constraints" });

  const buckets: Record<BucketKey, number> = { essentials, specificity, references, brandFit, constraints };
  // The Essentials marker at 50 means "every essential is in": until they are, the score stays below it.
  const total = Math.min(100, essentials + specificity + references + brandFit + constraints);
  const score = missingEssentials.length ? Math.min(total, 49) : total;

  // Lowest buckets first (by share of their maximum), then the biggest gain within a bucket.
  const ratio = (b: BucketKey) => buckets[b] / BUCKET_MAX[b];
  const suggestions = [...missing]
    .sort((a, b) => ratio(a.bucket) - ratio(b.bucket) || b.points - a.points)
    .filter((m, i, all) => all.findIndex((x) => x.key === m.key) === i)
    .slice(0, 2);

  const label = qualityLabel(score);
  const essentialsCovered = missingEssentials.length === 0;
  const status = essentialsCovered
    ? `${label} · essentials covered`
    : `${label} · ${missingEssentials.length} essential${missingEssentials.length === 1 ? "" : "s"} missing`;

  return { score, label, essentialsCovered, missingEssentials, buckets, suggestions, status };
}
