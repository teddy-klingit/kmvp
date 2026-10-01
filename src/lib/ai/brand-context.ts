import { jsonArray } from "@/lib/utils";
import type { Client, BrandOS } from "@/generated/prisma";

type VoiceAttribute = { label: string; leftLabel: string; rightLabel: string; value: number };
type AudiencePersona = { name: string; description: string; ageRange?: string; traits?: string[] };
type ColorEntry = { hex: string; name: string; role?: string };

/** Assembles the full brand record — not just the one-line summary — into a
 * block of text for any agent's prompt, so content an agent generates (or a
 * question it asks) is actually grounded in what's already known about the
 * brand instead of re-deriving or re-asking for it. */
export function buildBrandContext(client: Pick<Client, "name" | "industry" | "brandSummary">, brandOS: BrandOS | null) {
  const lines = [`Brand: ${client.name}`, `Industry: ${client.industry ?? "Not specified"}`];

  lines.push(`Brand summary: ${client.brandSummary ?? "No summary documented yet."}`);

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

  return lines.join("\n");
}
