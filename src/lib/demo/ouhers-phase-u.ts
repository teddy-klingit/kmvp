import { prisma } from "@/lib/prisma";
import type { Category } from "@/lib/output-categories";
import { PM_CONTEXT } from "@/lib/pm-thread";

/**
 * Phase U demo (U7): ouhers' AI runs with real-looking costs (model, tokens, cache reads, images), 8 messages with
 * Teddy (the HomeMessage script: general and about projects), and the Output library grown to about 60 pieces across
 * every category, with performance for ads and social, usage for decks and print, and a few with nothing yet.
 * Auto top-up stays off so the 92% warning shows. All dates relative to the seed date.
 */

const DAY = 86400000;
const MIN = 60000;

// Placeholder prices ($ per million tokens), as in the settings' defaults.
const PRICE = { "claude-sonnet-5-5": { in: 3, out: 15 }, "claude-haiku-5-5": { in: 1, out: 5 } } as const;
const IMAGE_USD = 0.04;
const SIMPLE = /caption|tone_check|compliance|resize/;

/**
 * The cost behind a run that used `credits`: a dollar amount that rounds up to exactly those credits (skills), on the
 * model the routing picks, split into output, uncached input and cached Brand OS reads, plus images for image runs.
 */
export function demoRunCost(key: string, type: "skill" | "assistant", credits: number, rnd: () => number) {
  const model: keyof typeof PRICE = type === "skill" && SIMPLE.test(key) ? "claude-haiku-5-5" : "claude-sonnet-5-5";
  const target = type === "skill" ? (Math.max(1, credits) - 1 + 0.3 + rnd() * 0.6) * 0.01 : credits * 0.01 * (0.7 + rnd() * 0.3);
  const images = /image_gen/.test(key) ? Math.max(1, Math.min(4, Math.floor((target - 0.01) / IMAGE_USD))) : 0;
  const text = Math.max(0.0005, target - images * IMAGE_USD);
  const p = PRICE[model];
  const tokensOut = Math.round((text * 0.55 * 1_000_000) / p.out);
  const tokensIn = Math.round((text * 0.4 * 1_000_000) / p.in);
  const cacheReadTokens = Math.round((text * 0.05 * 1_000_000) / (p.in * 0.1));
  const costUsd = Math.round(((tokensIn * p.in + cacheReadTokens * p.in * 0.1 + tokensOut * p.out) / 1_000_000 + images * IMAGE_USD) * 1_000_000) / 1_000_000;
  return { model, tokensIn, tokensOut, cacheReadTokens, images, costUsd, costEstimated: false };
}

type Ctx = {
  clientId: string;
  now: Date;
  teddyUserId: string | null;
  member: (packUserId: string) => { userId: string; clientUserId: string };
  projectId: (packProjectId: string) => string;
  say: (s: string) => void;
};

export async function seedPhaseU(ctx: Ctx) {
  const { clientId } = ctx;
  await prisma.billingProfile.updateMany({ where: { clientId }, data: { autoTopUp: false, aiOverage: "pause" } });
  const messages = await seedMessages(ctx);
  const outputs = await seedOutputs(ctx);
  ctx.say(`Phase U · ${messages} messages with Teddy · ${outputs.pieces} more outputs (${outputs.facts} usage facts) · auto top-up off`);
}

// ─── Messages with Teddy (HomeMessage) ─────────────────────────────────────
async function seedMessages(ctx: Ctx) {
  const { clientId, now } = ctx;
  if (!ctx.teddyUserId) return 0;
  const maja = ctx.member("ou-maja");
  const day = (back: number, h: number, m: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, h, m);
  const today = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * MIN);
  const SCRIPT: { at: Date; from: "teddy" | "maja"; about?: string; body: string }[] = [
    { at: day(2, 8, 58), from: "maja", body: "Morning Teddy! Is the updated Q4 plan ready?" },
    { at: day(2, 9, 12), from: "teddy", body: "Morning! Yes, it's in the Planner with the three new opportunities. Want to go through it on Thursday?" },
    { at: day(2, 9, 40), from: "maja", body: "Yes please. Can we also talk about the Stockholm pop-up in March? Nothing briefed yet, just an idea." },
    { at: day(2, 9, 44), from: "teddy", body: "Love it. I'll bring two options for how we could do it, and what it would cost in credits." },
    { at: day(1, 16, 20), from: "teddy", about: "p12-brand-film", body: "The brand film cut-downs are ready. Two notes from the team inside the project." },
    { at: day(1, 17, 2), from: "maja", about: "p12-brand-film", body: "Saw them! Will review tomorrow morning." },
    { at: today(150), from: "teddy", about: "p04-q4-cloudcream", body: "The cloud cream stories are in review. We went with the 9:16 texture shot: it reads much better on a phone." },
    { at: today(139), from: "teddy", body: "Also, could we do 15 minutes today on the Spring 2027 brief? It would make the estimate much easier, and we could start next week." },
  ];
  for (const m of SCRIPT) {
    const staff = m.from === "teddy";
    if (m.about) {
      await prisma.comment.create({ data: { projectId: ctx.projectId(m.about), contextKind: PM_CONTEXT, authorUserId: staff ? ctx.teddyUserId : null, authorClientUserId: staff ? null : maja.clientUserId, body: m.body, createdAt: m.at } });
    } else {
      await prisma.clientMessage.create({ data: { clientId, authorUserId: staff ? ctx.teddyUserId : maja.userId, authorClientUserId: staff ? null : maja.clientUserId, body: m.body, createdAt: m.at } });
    }
  }
  // Maja has read up to yesterday (today's two from Teddy are new); Teddy has read everything.
  const lastRead = [
    { userId: maja.userId, at: SCRIPT[5].at },
    { userId: ctx.teddyUserId, at: SCRIPT[7].at },
  ];
  for (const r of lastRead) await prisma.pmThreadRead.upsert({ where: { userId_clientId: { userId: r.userId, clientId } }, update: { lastReadAt: r.at }, create: { userId: r.userId, clientId, lastReadAt: r.at } });
  return SCRIPT.length;
}

// ─── The Output library: every category ────────────────────────────────────
type Piece = {
  project: string;
  name: string;
  format: string;
  category: Category;
  platform?: string;
  type?: "IMAGE" | "VIDEO" | "COPY" | "HTML5";
  daysAgo: number;
  color: string;
  ctr?: number;
  views?: number;
  metrics?: { hookRate?: number; savesVsAvg?: number };
  downloads?: number;
  facts?: { label: string; value?: number; note?: string; by?: "maja" | "teddy" }[];
  keywords?: string[];
};
const PIECES: Piece[] = [
  // Social: organic posts, measured on the connected channels.
  { project: "p06-dewdrop-creators", name: "Glass skin, minus the effort", format: "Post 4:5", category: "Social", platform: "Instagram", daysAgo: 9, color: "#F6CDB8", metrics: { savesVsAvg: 2.3 }, views: 14800, keywords: ["dew drop", "glow"] },
  { project: "p01-launch-first-five", name: "Texture close-up · milk wash", format: "Post 1:1", category: "Social", platform: "Instagram", daysAgo: 79, color: "#FBF6F0", metrics: { savesVsAvg: 1.8 }, keywords: ["milk wash", "texture"] },
  { project: "p03-lipours-shade-vote", name: "Behind the shade vote", format: "Story 9:16", category: "Social", platform: "TikTok", daysAgo: 41, color: "#E7B9B0", views: 18400, keywords: ["lip ours"] },
  { project: "p11-agent-seasonal", name: "Ingredient of the week: squalane", format: "Carousel 4:5", category: "Social", platform: "Instagram", daysAgo: 12, color: "#D7E3D0", metrics: { savesVsAvg: 3.1 }, keywords: ["ingredients"] },
  { project: "p01-launch-first-five", name: "Launch countdown, day 1", format: "Story 9:16", category: "Social", platform: "Instagram", daysAgo: 87, color: "#F2E2EE" },
  { project: "p02-summer-sunday", name: "sun day · pin", format: "Pin 2:3", category: "Social", platform: "Pinterest", daysAgo: 66, color: "#F3D9A4", views: 6200 },
  // Video and motion.
  { project: "p02-summer-sunday", name: "sun day · 6s bumper", format: "Video 16:9", category: "Video & motion", platform: "YouTube", type: "VIDEO", daysAgo: 64, color: "#F3D9A4", metrics: { hookRate: 38 }, views: 41200 },
  { project: "p01-launch-first-five", name: "The first five · 15s cut", format: "Video 9:16", category: "Video & motion", platform: "Instagram", type: "VIDEO", daysAgo: 88, color: "#F6CDB8", metrics: { hookRate: 31 }, views: 27400 },
  { project: "p06-dewdrop-creators", name: "dew drop texture loop", format: "Motion loop 1:1", category: "Video & motion", type: "VIDEO", daysAgo: 3, color: "#DCE8F0" },
  { project: "p01-launch-first-five", name: "Logo animation", format: "Animation 16:9", category: "Video & motion", type: "VIDEO", daysAgo: 85, color: "#1E1E1E", facts: [{ label: "Used in", note: "the Stockholm launch event screens", by: "maja" }] },
  // Presentations: usage, never CTR.
  { project: "p01-launch-first-five", name: "Launch deck for retail partners", format: "Deck 16:9 · 18 slides", category: "Presentations", daysAgo: 80, color: "#FBF6F0", downloads: 14, facts: [{ label: "Shared with", note: "Åhléns and Magasin buyers", by: "maja" }] },
  { project: "p03-lipours-shade-vote", name: "Shade vote campaign overview", format: "Deck 16:9 · 9 slides", category: "Presentations", daysAgo: 39, color: "#E7B9B0", facts: [{ label: "Used in", note: "the September board meeting", by: "maja" }] },
  { project: "p02-summer-sunday", name: "Summer results recap", format: "Deck 16:9 · 12 slides", category: "Presentations", daysAgo: 30, color: "#F3D9A4", downloads: 6 },
  { project: "p01-launch-first-five", name: "Brand guidelines, short version", format: "Deck PDF · 8 pages", category: "Presentations", daysAgo: 4, color: "#E9D8C8" },
  // Print: printed and sent, never CTR.
  { project: "p01-launch-first-five", name: "Launch event poster", format: "Poster A2", category: "Print", daysAgo: 84, color: "#F6CDB8", facts: [{ label: "Printed", value: 40, by: "maja" }, { label: "Used in", note: "the Stockholm launch event", by: "maja" }] },
  { project: "p01-launch-first-five", name: "Gift card · the first five", format: "Gift card 85×55", category: "Print", daysAgo: 83, color: "#F2E2EE", facts: [{ label: "Printed", value: 2000, by: "teddy" }] },
  { project: "p02-summer-sunday", name: "Shelf talker · sun day", format: "Shelf talker A6", category: "Print", daysAgo: 70, color: "#F3D9A4", facts: [{ label: "Printed", value: 600, by: "teddy" }, { label: "Sent to", note: "38 stores", by: "teddy" }] },
  { project: "p01-launch-first-five", name: "Sample sachet insert", format: "Insert A6", category: "Print", daysAgo: 82, color: "#FBF6F0", facts: [{ label: "Printed", value: 5000, by: "maja" }] },
  { project: "p03-lipours-shade-vote", name: "Shade card", format: "Leaflet A5", category: "Print", daysAgo: 1, color: "#E7B9B0" },
  // Web.
  { project: "p07-website-pdp", name: "PDP hero · cloud cream", format: "Web hero 1920×800", category: "Web", type: "HTML5", daysAgo: 11, color: "#FBF6F0", facts: [{ label: "Used in", note: "ouhers.se/cloud-cream", by: "teddy" }] },
  { project: "p03-lipours-shade-vote", name: "Shade vote landing page", format: "Landing page", category: "Web", type: "HTML5", daysAgo: 45, color: "#E7B9B0", facts: [{ label: "Leads", value: 1240, by: "maja" }] },
  { project: "p07-website-pdp", name: "milk wash product page", format: "Product page", category: "Web", type: "HTML5", daysAgo: 2, color: "#DCE8F0" },
  // Copy and email.
  { project: "p02-summer-sunday", name: "Summer newsletter", format: "Email 600px", category: "Copy & email", daysAgo: 60, color: "#F3D9A4", facts: [{ label: "Sent to", note: "42,000 subscribers", by: "maja" }, { label: "Sales", value: 312, by: "maja" }] },
  // Illustration.
  { project: "p11-agent-seasonal", name: "Ingredient icons (12)", format: "Icon set SVG", category: "Illustration", daysAgo: 14, color: "#D7E3D0", downloads: 9, facts: [{ label: "Used in", note: "product pages and packaging", by: "teddy" }] },
  { project: "p03-lipours-shade-vote", name: "Shade map illustration", format: "Illustration 4:5", category: "Illustration", daysAgo: 44, color: "#E7B9B0", facts: [{ label: "Used in", note: "the shade vote landing page", by: "teddy" }] },
  { project: "p11-agent-seasonal", name: "Squalane drop character", format: "Illustration 1:1", category: "Illustration", daysAgo: 5, color: "#D7E3D0" },
  // Other.
  { project: "p01-launch-first-five", name: "Press kit", format: "ZIP · 24 files", category: "Other", daysAgo: 86, color: "#E9D8C8", downloads: 22 },
];

async function seedOutputs(ctx: Ctx) {
  const { clientId, now } = ctx;
  let facts = 0;
  for (const p of PIECES) {
    const at = new Date(now.getTime() - p.daysAgo * DAY - 3 * 3600000);
    const tags = { keywords: p.keywords ?? [], ...(p.metrics ? { metrics: p.metrics } : {}), demo: "phase-u" };
    const asset = await prisma.asset.create({
      data: {
        projectId: ctx.projectId(p.project),
        clientId,
        name: p.name,
        format: p.format,
        platform: p.platform ?? null,
        type: p.type ?? "IMAGE",
        category: p.category,
        status: "DELIVERED",
        version: 1,
        sentVersion: 1,
        thumbnailColor: p.color,
        performanceCtr: p.ctr ?? null,
        performanceViews: p.views ?? null,
        downloadCount: p.downloads ?? 0,
        uploadedByUserId: ctx.teddyUserId,
        tags,
        createdAt: new Date(at.getTime() - 2 * DAY),
      },
    });
    await prisma.assetVersion.create({ data: { assetId: asset.id, projectId: asset.projectId, number: 1, state: "APPROVED", uploadedByUserId: ctx.teddyUserId, sentAt: at, sentByUserId: ctx.teddyUserId, createdAt: at } });
    for (const [i, f] of (p.facts ?? []).entries()) {
      const by = f.by === "maja" ? ctx.member("ou-maja").userId : ctx.teddyUserId;
      await prisma.outputFact.create({ data: { clientId, assetId: asset.id, label: f.label, value: f.value ?? null, note: f.note ?? null, source: f.by === "maja" ? "client" : "staff", createdByUserId: by, createdAt: new Date(at.getTime() + (i + 1) * DAY) } });
      facts++;
    }
  }
  facts += await enrichEarlier(ctx);
  return { pieces: PIECES.length, facts };
}

/**
 * Earlier pieces that ran get a number too: delivered ads without a CTR, the shade vote carousel's later slides
 * (saves) and the skill outputs that were used. Q4's copy and stories are still new, so they keep "+ Add how it did".
 */
async function enrichEarlier(ctx: Ctx) {
  const { clientId } = ctx;
  const CTR = [1.02, 1.18, 0.98, 1.26]; // keeps the client's own average CTR near the pack's 1.08
  const ads = await prisma.asset.findMany({ where: { clientId, status: "DELIVERED", sentVersion: { not: null }, performanceCtr: null, type: "IMAGE", platform: { not: null }, format: { in: ["Square 1:1", "Link ad 1.91:1", "Feed 4:5", "Story 9:16"] }, category: null }, orderBy: { name: "asc" }, select: { id: true } });
  for (const [i, a] of ads.entries()) await prisma.asset.update({ where: { id: a.id }, data: { performanceCtr: CTR[i % CTR.length] } });
  const SAVES = [1.6, 1.3, 1.2];
  const slides = await prisma.asset.findMany({ where: { clientId, performanceCtr: null, format: { startsWith: "Carousel" }, sentVersion: { not: null }, category: null }, orderBy: { name: "asc" }, select: { id: true, tags: true } });
  for (const [i, a] of slides.entries()) await prisma.asset.update({ where: { id: a.id }, data: { tags: { ...((a.tags ?? {}) as object), metrics: { savesVsAvg: SAVES[i % SAVES.length] } } } });
  const USED: [string, string, string][] = [
    ["cloud cream · story ad copy", "Used in", "the cloud cream story ads on Meta"],
    ["dew drop · launch caption", "Used in", "Instagram, launch day"],
    ["Market recap · week 41", "Shared with", "the marketing team"],
    ["milk wash · carousel caption", "Used in", "Instagram"],
    ["sun day · retargeting ad copy", "Used in", "the retargeting ads on Meta"],
  ];
  const maja = ctx.member("ou-maja").userId;
  let n = 0;
  for (const [title, label, note] of USED) {
    const o = await prisma.skillOutput.findFirst({ where: { clientId, title }, select: { id: true, createdAt: true } });
    if (!o) continue;
    await prisma.outputFact.create({ data: { clientId, skillOutputId: o.id, label, note, source: "client", createdByUserId: maja, createdAt: new Date(o.createdAt.getTime() + DAY) } });
    n++;
  }
  return n;
}
