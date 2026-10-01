import { prisma } from "../src/lib/prisma";

async function main() {
  const client = await prisma.client.findFirstOrThrow({ where: { slug: "klarna" } });
  const clientId = client.id;

  // --- Brand & Message platform ---
  await prisma.brandOS.update({
    where: { clientId },
    data: {
      vision:
        "A world where paying is never the worst part of buying — where every purchase feels fair, transparent, and completely in the customer's control.",
      mission:
        "Give people a smarter, more human way to pay — one that respects their time, their money, and their intelligence, so shopping feels like a relationship, not a transaction.",
      coreValues: [
        { title: "Radically transparent", description: "No hidden fees, no fine print tricks — pricing people can actually trust." },
        { title: "Human, not corporate", description: "We write and design like a person talking to a person, never a bank talking down to a customer." },
        { title: "Fast by default", description: "Every flow — checkout, approvals, support — is built to remove friction, not add steps." },
        { title: "Design-led", description: "Visual craft is not decoration — it's how we signal that finance can feel good." },
      ],
      usps: [
        "0% interest, always — no surprise charges, ever",
        "3-second checkout approval",
        "150M+ shoppers and 500K+ retail partners globally",
        "One app for every purchase, return, and payment plan",
      ],
      servicesNote:
        "Core services: Pay in 4, Pay in 30 days, the Klarna Card, the Klarna shopping app/browser extension, and in-store QR checkout. All services share one identity system and one tone of voice across every market.",
    },
  });

  // --- Visual identity: enrich existing assets with file metadata ---
  const metaByVariant: Record<string, { dimensions: string; fileSizeLabel: string; colorSpace: string; format: string }> = {
    Primary: { dimensions: "1800 x 1800", fileSizeLabel: "1 MB", colorSpace: "RGB", format: "SVG" },
    "Reversed / white": { dimensions: "1800 x 1800", fileSizeLabel: "980 KB", colorSpace: "RGB", format: "SVG" },
    "Icon mark": { dimensions: "512 x 512", fileSizeLabel: "220 KB", colorSpace: "RGB", format: "SVG" },
    "Wordmark only": { dimensions: "2400 x 600", fileSizeLabel: "640 KB", colorSpace: "RGB", format: "SVG" },
    Lifestyle: { dimensions: "4000 x 3000", fileSizeLabel: "6.4 MB", colorSpace: "RGB", format: "JPG" },
    Studio: { dimensions: "3600 x 3600", fileSizeLabel: "5.1 MB", colorSpace: "RGB", format: "JPG" },
    Backdrop: { dimensions: "2000 x 2000", fileSizeLabel: "1.8 MB", colorSpace: "RGB", format: "PNG" },
    "24px outline": { dimensions: "24 x 24", fileSizeLabel: "48 KB", colorSpace: "RGB", format: "SVG" },
    "Campaign asset": { dimensions: "2400 x 2400", fileSizeLabel: "2.2 MB", colorSpace: "RGB", format: "PNG" },
  };
  const existing = await prisma.brandAsset.findMany({ where: { clientId } });
  for (const a of existing) {
    const meta = a.variant ? metaByVariant[a.variant] : undefined;
    if (!meta) continue;
    await prisma.brandAsset.update({
      where: { id: a.id },
      data: {
        dimensions: meta.dimensions,
        fileSizeLabel: meta.fileSizeLabel,
        colorSpace: meta.colorSpace,
        format: a.format ?? meta.format,
      },
    });
  }

  // --- New Visual identity assets: fill out Video, Animation, and a few more per category ---
  await prisma.brandAsset.createMany({
    data: [
      {
        clientId,
        name: "App walkthrough loop",
        category: "VIDEO",
        variant: "Product demo",
        format: "MP4",
        previewColor: "var(--avatar-3)",
        dimensions: "1920 x 1080",
        fileSizeLabel: "18.2 MB",
        colorSpace: "RGB",
      },
      {
        clientId,
        name: "Checkout moment — hero film",
        category: "VIDEO",
        variant: "Vertical cutdown",
        format: "MP4",
        previewColor: "var(--avatar-1)",
        dimensions: "1080 x 1920",
        fileSizeLabel: "24.6 MB",
        colorSpace: "RGB",
      },
      {
        clientId,
        name: "Logo reveal",
        category: "ANIMATION",
        variant: "Intro sting",
        format: "MP4",
        previewColor: "var(--avatar-3)",
        dimensions: "1080 x 1080",
        fileSizeLabel: "3.1 MB",
        colorSpace: "RGB",
      },
      {
        clientId,
        name: "Confetti success state",
        category: "ANIMATION",
        variant: "UI micro-interaction",
        format: "Lottie",
        previewColor: "var(--avatar-1)",
        dimensions: "800 x 800",
        fileSizeLabel: "410 KB",
        colorSpace: "RGB",
      },
      {
        clientId,
        name: "Klarna favicon",
        category: "LOGO",
        variant: "App icon",
        format: "PNG",
        previewColor: "var(--avatar-1)",
        dimensions: "512 x 512",
        fileSizeLabel: "64 KB",
        colorSpace: "RGB",
      },
      {
        clientId,
        name: "Navigation icon set",
        category: "ICON",
        variant: "16px solid",
        format: "SVG",
        previewColor: "var(--avatar-3)",
        dimensions: "16 x 16",
        fileSizeLabel: "32 KB",
        colorSpace: "RGB",
      },
      {
        clientId,
        name: "Confetti pattern",
        category: "PATTERN",
        variant: "Celebration",
        format: "PNG",
        previewColor: "var(--avatar-1)",
        dimensions: "2000 x 2000",
        fileSizeLabel: "1.4 MB",
        colorSpace: "RGB",
      },
      {
        clientId,
        name: "Shopper portrait",
        category: "PHOTOGRAPHY",
        variant: "Lifestyle",
        format: "JPG",
        previewColor: "var(--avatar-8)",
        dimensions: "4000 x 5000",
        fileSizeLabel: "7.1 MB",
        colorSpace: "RGB",
      },
      {
        clientId,
        name: "Wrapped-style character set",
        category: "ILLUSTRATION",
        variant: "Character library",
        format: "SVG",
        previewColor: "var(--avatar-5)",
        dimensions: "1600 x 1600",
        fileSizeLabel: "1.1 MB",
        colorSpace: "RGB",
      },
    ],
  });

  // --- Templates: fill out a proper Content Production category set ---
  await prisma.template.createMany({
    data: [
      { clientId, name: "Blog post design template", figmaUrl: "https://figma.com/file/klarna-blog", category: "Blog Posts", previewColor: "var(--avatar-3)", usageCount: 12 },
      { clientId, name: "Blog Posts text template", figmaUrl: "https://figma.com/file/klarna-blog-copy", category: "Blog Posts", previewColor: "var(--avatar-6)", usageCount: 9 },
      { clientId, name: "Case study one-pager", figmaUrl: "https://figma.com/file/klarna-case-study", category: "Case Studies", previewColor: "var(--avatar-4)", usageCount: 6 },
      { clientId, name: "E-book cover + interior", figmaUrl: "https://figma.com/file/klarna-ebook", category: "E-Books", previewColor: "var(--avatar-5)", usageCount: 4 },
      { clientId, name: "Whitepaper layout", figmaUrl: "https://figma.com/file/klarna-whitepaper", category: "Whitepapers", previewColor: "var(--avatar-7)", usageCount: 3 },
      { clientId, name: "Podcast cover art", figmaUrl: "https://figma.com/file/klarna-podcast", category: "Podcast Covers", previewColor: "var(--avatar-1)", usageCount: 8 },
      { clientId, name: "Video lower-third pack", figmaUrl: "https://figma.com/file/klarna-video", category: "Video Content", previewColor: "var(--avatar-2)", usageCount: 15 },
      { clientId, name: "Video end-card template", figmaUrl: "https://figma.com/file/klarna-video-end", category: "Video Content", previewColor: "var(--avatar-8)", usageCount: 11 },
    ],
  });

  console.log("Brand DAM seed complete for", client.name);
}

main().finally(() => prisma.$disconnect());
