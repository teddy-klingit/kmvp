import { jsonArray } from "@/lib/utils";
import type { Client, BrandOS } from "@/generated/prisma";

type VoiceAttribute = { label: string; leftLabel: string; rightLabel: string; value: number };
type AudiencePersona = { name: string; description: string; ageRange?: string; traits?: string[] };
type ColorEntry = { hex: string; name: string; role?: string };

/** Assembles the full brand record — not just the one-line summary — into a
 * block of text for any agent's prompt, so content an agent generates (or a
 * question it asks) is actually grounded in what's already known about the
 * brand instead of re-deriving or re-asking for it. */
/** `linkedSources` is the block from brandSourcesForAgents(): titles, apps and URLs of the client's linked brand
 * material (Drive, Figma, …). Agents may reference them; their contents are never fetched. */
export function buildBrandContext(client: Pick<Client, "name" | "industry" | "brandSummary">, brandOS: BrandOS | null, linkedSources?: string) {
  const lines = [`Brand: ${client.name}`, `Industry: ${client.industry ?? "Not specified"}`];

  lines.push(`Brand summary: ${client.brandSummary ?? "No summary documented yet."}`);

  // The brand & message platform (Brand OS). Every section an agent can use is listed in SECTION_READERS.
  if (brandOS?.vision) lines.push(`Vision: ${brandOS.vision}`);
  if (brandOS?.mission) lines.push(`Mission: ${brandOS.mission}`);
  const coreValues = jsonArray<{ title: string; description: string }>(brandOS?.coreValues);
  if (coreValues.length > 0) lines.push("Core values: " + coreValues.map((v) => `${v.title} (${v.description})`).join("; "));
  const usps = jsonArray<string>(brandOS?.usps);
  if (usps.length > 0) lines.push("USPs: " + usps.join("; "));
  if (brandOS?.competitiveNote) lines.push(`Market position: ${brandOS.competitiveNote}`);
  const products = jsonArray<string>(brandOS?.keyProducts);
  if (brandOS?.servicesNote || products.length > 0) lines.push(`Services & products: ${[brandOS?.servicesNote, products.join(", ")].filter(Boolean).join(" · ")}`);

  const audiencePersonas = jsonArray<AudiencePersona>(brandOS?.audiencePersonas);
  if (audiencePersonas.length > 0) {
    lines.push(
      "Target audience personas: " +
        audiencePersonas
          .map((p) => `${p.name}${p.ageRange ? ` (${p.ageRange})` : ""} — ${p.description}${p.traits?.length ? ` [${p.traits.join(", ")}]` : ""}`)
          .join("; ")
    );
  }

  if (brandOS?.imageryStyle) lines.push(`Imagery style: ${brandOS.imageryStyle}`);
  if (brandOS?.illustrationStyle) lines.push(`Illustration style: ${brandOS.illustrationStyle}`);

  const voiceAttributes = jsonArray<VoiceAttribute>(brandOS?.voiceAttributes);
  if (voiceAttributes.length > 0) {
    lines.push(
      "Voice attributes: " +
        voiceAttributes.map((v) => `${v.leftLabel}↔${v.rightLabel} (leans ${v.value >= 50 ? v.rightLabel : v.leftLabel})`).join(", ")
    );
  }

  const toneRules = jsonArray<string>(brandOS?.toneRules);
  if (toneRules.length > 0) lines.push("Tone rules: " + toneRules.join("; "));

  const dos = jsonArray<string>(brandOS?.dos);
  if (dos.length > 0) lines.push("Do: " + dos.join("; "));

  const donts = jsonArray<string>(brandOS?.donts);
  if (donts.length > 0) lines.push("Don't: " + donts.join("; "));

  const colorPalette = jsonArray<ColorEntry>(brandOS?.colorPalette);
  if (colorPalette.length > 0) {
    lines.push("Approved color palette: " + colorPalette.map((c) => `${c.name} (${c.hex}${c.role ? `, ${c.role}` : ""})`).join(", "));
  }

  if (brandOS?.approvedTypography) lines.push(`Approved typography: ${JSON.stringify(brandOS.approvedTypography)}`);

  if (linkedSources) lines.push(linkedSources);

  return lines.join("\n");
}
