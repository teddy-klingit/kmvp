import type { BrandOS, Client } from "@/generated/prisma";
import { BRAND_PLATFORM_DOCS } from "@/lib/brand-iq-taxonomy";
import { jsonArray } from "@/lib/utils";

/**
 * Brand OS completeness (BrandIQ.dc.html), computed from what's actually written, never a stored score.
 * One place maps each platform section to its field, its prompt question and the agents that read it.
 */
type BrandFields = Pick<Client, "brandSummary"> & { brandOS: Pick<BrandOS, "vision" | "mission" | "coreValues" | "usps" | "competitiveNote" | "audiencePersonas" | "servicesNote" | "keyProducts"> | null };

const has = (s: string | null | undefined) => Boolean(s && s.trim());

type SectionDef = { slug: string; prompt: string; done: (b: BrandFields) => boolean };

const DEFS: SectionDef[] = [
  { slug: "our-brand", prompt: "How would you describe the brand in two or three sentences?", done: (b) => has(b.brandSummary) },
  { slug: "vision", prompt: "Where is the brand headed? The future it wants to create.", done: (b) => has(b.brandOS?.vision) },
  { slug: "mission", prompt: "What does the brand do every day to get there, and for whom?", done: (b) => has(b.brandOS?.mission) },
  { slug: "core-values", prompt: "The few values every piece of work should show. One per line: Title | what it means.", done: (b) => jsonArray(b.brandOS?.coreValues).length > 0 },
  { slug: "usps", prompt: "Why choose this brand over the alternatives? One reason per line.", done: (b) => jsonArray(b.brandOS?.usps).length > 0 },
  { slug: "market-position", prompt: "Where does the brand sit against its competitors, and what sets it apart?", done: (b) => has(b.brandOS?.competitiveNote) },
  { slug: "target-audience", prompt: "Who is it for? One persona per line: Name | age range | description | traits.", done: (b) => jsonArray(b.brandOS?.audiencePersonas).length > 0 },
  { slug: "services-products", prompt: "What does the brand sell? The services and products work should feature.", done: (b) => has(b.brandOS?.servicesNote) || jsonArray(b.brandOS?.keyProducts).length > 0 },
];

export const PLATFORM_SECTIONS: (SectionDef & { label: string })[] = DEFS.map((s) => ({ ...s, label: BRAND_PLATFORM_DOCS.find((d) => d.slug === s.slug)?.label ?? s.slug }));

export function platformStatus(b: BrandFields) {
  const sections = PLATFORM_SECTIONS.map((s, i) => ({ slug: s.slug, label: s.label, prompt: s.prompt, index: i + 1, done: s.done(b) }));
  const done = sections.filter((s) => s.done).length;
  return { sections, done, total: sections.length, empty: sections.filter((s) => !s.done) };
}

/**
 * Which agents read each section, from what their prompts are actually given: buildBrandContext() carries
 * every platform section (intake, the self-serve brief, ad concepts, image generation and copy); the brief,
 * estimate and feedback agents get the brand summary only.
 */
const CONTEXT_AGENTS = ["Intake", "Self-serve brief", "Ad concepts", "Image generation", "Copy"];
export const SECTION_READERS: Record<string, string[]> = Object.fromEntries(
  PLATFORM_SECTIONS.map((s) => [s.slug, s.slug === "our-brand" ? ["Intake", "Brief", "Estimate", "Feedback", ...CONTEXT_AGENTS.slice(1)] : CONTEXT_AGENTS])
);
