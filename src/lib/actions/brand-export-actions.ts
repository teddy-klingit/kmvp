"use server";

import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { typefaces } from "@/lib/brand-typography";

type Persona = { name: string; ageRange: string; description: string; traits: string[] };
type CoreValue = { title: string; description: string };
type VoiceAttribute = { label: string; leftLabel: string; rightLabel: string; value: number };
type PaletteColor = { hex: string; name: string; role: string };

export async function getBrandExportText(): Promise<string> {
  const viewer = await getPortalViewer();
  const [client, brandOS, brandAssets] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId } }),
    prisma.brandOS.findUnique({ where: { clientId: viewer.clientId } }),
    prisma.brandAsset.findMany({ where: { clientId: viewer.clientId } }),
  ]);

  const lines: string[] = [];
  const heading = (t: string) => lines.push("", `## ${t}`, "");

  lines.push(`# ${client.name} — Brand Guide`, `Exported ${new Date().toISOString().slice(0, 10)}`);

  heading("Company & product");
  lines.push(`Industry: ${client.industry ?? "—"}`);
  lines.push(`Value proposition: ${brandOS?.valueProposition ?? "—"}`);
  const products = jsonArray<string>(brandOS?.keyProducts);
  if (products.length) lines.push(`Key products: ${products.join(", ")}`);

  heading("Our Brand");
  lines.push(client.brandSummary ?? "—");

  heading("Vision");
  lines.push(brandOS?.vision ?? "—");

  heading("Mission");
  lines.push(brandOS?.mission ?? "—");

  const coreValues = jsonArray<CoreValue>(brandOS?.coreValues);
  if (coreValues.length) {
    heading("Core values");
    coreValues.forEach((v) => lines.push(`- ${v.title}: ${v.description}`));
  }

  const usps = jsonArray<string>(brandOS?.usps);
  if (usps.length) {
    heading("USPs");
    usps.forEach((u) => lines.push(`- ${u}`));
  }

  heading("Market position");
  lines.push(brandOS?.competitiveNote ?? "—");

  const personas = jsonArray<Persona>(brandOS?.audiencePersonas);
  if (personas.length) {
    heading("Target audience");
    personas.forEach((p) =>
      lines.push(`- ${p.name} (${p.ageRange}): ${p.description} [${p.traits.join(", ")}]`)
    );
  }

  const voice = jsonArray<VoiceAttribute>(brandOS?.voiceAttributes);
  if (voice.length) {
    heading("Voice & tone");
    voice.forEach((v) => lines.push(`- ${v.leftLabel} ←→ ${v.rightLabel}: ${v.value}/100`));
  }

  heading("Imagery style");
  lines.push(brandOS?.imageryStyle ?? "—");

  heading("Illustration style");
  lines.push(brandOS?.illustrationStyle ?? "—");

  const palette = jsonArray<PaletteColor>(brandOS?.colorPalette);
  const legacyColors = jsonArray<string>(brandOS?.approvedColors);
  heading("Colour palette");
  if (palette.length) {
    palette.forEach((c) => lines.push(`- ${c.name} (${c.role}): ${c.hex}`));
  } else {
    legacyColors.forEach((c) => lines.push(`- ${c}`));
  }

  const typography = typefaces(brandOS?.approvedTypography).map((t) => t.text);
  if (typography.length) {
    heading("Typography");
    typography.forEach((t) => lines.push(`- ${t}`));
  }

  heading(`Visual identity assets (${brandAssets.length})`);
  brandAssets.forEach((a) =>
    lines.push(`- [${a.category}] ${a.name}${a.variant ? ` — ${a.variant}` : ""}${a.format ? ` (${a.format})` : ""}`)
  );

  return lines.join("\n");
}
