/**
 * Fills the Klarna demo account with the data its pages need, on any database (production included):
 * - a content plan (SOW targets, planned posts, an own item) and published posts with metrics;
 * - linked brand sources and two demo connections (Drive, Figma);
 * - DUMMY integration data, approved for the demo: LinkedIn/Instagram followers, community, audience and
 *   Google Analytics website numbers, plus a dummy card on file. Client.demoSources and cardIsDemo make the
 *   UI label all of it "demo".
 *
 * Insert-only and idempotent: each block is skipped when Klarna already has that kind of data. A JSON backup
 * of the Klarna client row is written before it's updated. Dry run by default:
 *   npx tsx scripts/demo/seed-klarna-demo.ts            # report only
 *   npx tsx scripts/demo/seed-klarna-demo.ts --apply    # write
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "../../src/generated/prisma";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const DAY = 86400000;
const at = (days: number, hour = 10) => {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};

async function block(name: string, has: () => Promise<number>, write: () => Promise<unknown>) {
  const n = await has();
  if (n > 0) return console.log(`- ${name}: already there (${n}), skipped`);
  console.log(`- ${name}: ${apply ? "writing" : "would write"}`);
  if (apply) await write();
}

async function main() {
  const klarna = await prisma.client.findFirstOrThrow({ where: { name: "Klarna" } });
  const jack = await prisma.user.findFirst({ where: { email: "jack.ross@klarna.com" }, select: { id: true } });
  const id = klarna.id;

  await block("content plan targets", () => prisma.contentPlanTarget.count({ where: { clientId: id } }), () =>
    prisma.contentPlanTarget.createMany({ data: [{ clientId: id, platform: "Instagram", weeklyVolume: 2 }, { clientId: id, platform: "LinkedIn", weeklyVolume: 1 }] })
  );

  await block("planned posts + own item", () => prisma.contentPost.count({ where: { clientId: id, status: "PLANNED" } }), async () => {
    await prisma.contentPost.createMany({
      data: [
        { clientId: id, platform: "LinkedIn", channelType: "ORGANIC", contentType: "Feed post", title: "LinkedIn post", status: "PLANNED", scheduledDate: at(5) },
        { clientId: id, platform: "Instagram", channelType: "ORGANIC", contentType: "Reel", title: "Instagram reel", status: "PLANNED", scheduledDate: at(19) },
        { clientId: id, platform: "LinkedIn", channelType: "ORGANIC", contentType: "Feed post", title: "Customer story", status: "PLANNED", scheduledDate: at(23) },
      ],
    });
    await prisma.clientCalendarItem.create({ data: { clientId: id, title: "Newsletter", date: at(12), channel: "Email" } });
  });

  await block("published posts with metrics", () => prisma.contentPost.count({ where: { clientId: id, status: "PUBLISHED" } }), () =>
    prisma.contentPost.createMany({
      data: [
        { title: "Pay in 4, explained in 15 seconds", platform: "Instagram", contentType: "Reel", d: -24, impressions: 48200, engagementRate: 5.8, videoViews: 31400, saves: 610, shares: 240, websiteClicks: 380 },
        { title: "Behind the checkout: the Klarna app team", platform: "LinkedIn", contentType: "Carousel", d: -17, impressions: 22100, engagementRate: 4.1, saves: 190, shares: 85, websiteClicks: 210 },
        { title: "Summer picks, paid your way", platform: "Instagram", contentType: "Carousel", d: -12, impressions: 39800, engagementRate: 3.6, saves: 420, shares: 130, websiteClicks: 150 },
        { title: "Interest-free, always: a 1-minute guide", platform: "Instagram", contentType: "Story", d: -8, impressions: 27600, engagementRate: 2.4, videoViews: 18900, saves: 90, shares: 40, websiteClicks: 95 },
        { title: "What 150M shoppers taught us about checkout", platform: "LinkedIn", contentType: "Feed post", d: -4, impressions: 15400, engagementRate: 3.2, saves: 75, shares: 60, websiteClicks: 120 },
        { title: "Holiday wishlist teaser", platform: "Instagram", contentType: "Reel", d: -1, impressions: 21300, engagementRate: 6.4, videoViews: 16200, saves: 330, shares: 150, websiteClicks: 260 },
      ].map(({ d, ...p }) => ({ clientId: id, channelType: "ORGANIC" as const, status: "PUBLISHED" as const, publishedDate: at(d), scheduledDate: at(d), engagements: Math.round(p.impressions * (p.engagementRate / 100)), ...p })),
    })
  );

  // ── Dummy integration data (LinkedIn / Instagram / Google Analytics), labelled "demo" in the UI ──
  await block("follower growth (demo)", () => prisma.followerSnapshot.count({ where: { clientId: id } }), () =>
    prisma.followerSnapshot.createMany({
      data: [0, 1, 2, 3, 4, 5, 6, 7].flatMap((w) => [
        { clientId: id, platform: "Instagram", followerCount: 1_204_000 + w * 6_800, capturedAt: at(-(7 - w) * 7) },
        { clientId: id, platform: "LinkedIn", followerCount: 512_000 + w * 2_900, capturedAt: at(-(7 - w) * 7) },
      ]),
    })
  );

  await block("community (demo)", () => prisma.communityManagementSnapshot.count({ where: { clientId: id } }), async () => {
    await prisma.communityManagementSnapshot.createMany({
      data: [
        { start: -56, comments: 1840, dms: 312, pos: 61, neu: 29, neg: 10, esc: 1 },
        { start: -42, comments: 2010, dms: 355, pos: 63, neu: 28, neg: 9, esc: 0 },
        { start: -28, comments: 2260, dms: 398, pos: 58, neu: 30, neg: 12, esc: 2 },
        { start: -14, comments: 2410, dms: 421, pos: 64, neu: 27, neg: 9, esc: 1 },
      ].map((c) => ({ clientId: id, periodStart: at(c.start), periodEnd: at(c.start + 13), commentVolume: c.comments, dmVolume: c.dms, sentimentPositivePct: c.pos, sentimentNeutralPct: c.neu, sentimentNegativePct: c.neg, escalations: c.esc })),
    });
    await prisma.communityEscalation.createMany({
      data: [
        { clientId: id, platform: "Instagram", snippet: "My refund from the store hasn't shown up in the app after 10 days, who do I talk to?", sentiment: "NEGATIVE", createdAt: at(-1, 14) },
        { clientId: id, platform: "LinkedIn", snippet: "Is Pay in 4 coming to B2B purchases? Our finance team keeps asking.", sentiment: "NEUTRAL", createdAt: at(-2, 9) },
        { clientId: id, platform: "Instagram", snippet: "The summer reel was so good, where do I find the pink sneakers?", sentiment: "POSITIVE", status: "RESOLVED", createdAt: at(-9, 16) },
      ],
    });
  });

  await block("audience (demo)", () => prisma.audienceSnapshot.count({ where: { clientId: id } }), () =>
    prisma.audienceSnapshot.createMany({
      data: [
        {
          clientId: id,
          platform: "Instagram",
          ageBreakdown: [{ label: "18–24", pct: 31 }, { label: "25–34", pct: 42 }, { label: "35–44", pct: 18 }, { label: "45+", pct: 9 }],
          genderBreakdown: [{ label: "Women", pct: 58 }, { label: "Men", pct: 40 }, { label: "Other", pct: 2 }],
          topLocations: [{ label: "Sweden", pct: 22 }, { label: "Germany", pct: 19 }, { label: "United States", pct: 17 }],
          capturedAt: at(-2),
        },
        {
          clientId: id,
          platform: "LinkedIn",
          ageBreakdown: [{ label: "18–24", pct: 12 }, { label: "25–34", pct: 39 }, { label: "35–44", pct: 31 }, { label: "45+", pct: 18 }],
          topLocations: [{ label: "Sweden", pct: 28 }, { label: "United Kingdom", pct: 16 }, { label: "Germany", pct: 14 }],
          capturedAt: at(-2),
        },
      ],
    })
  );

  await block("website (demo)", () => prisma.websiteAnalyticsSnapshot.count({ where: { clientId: id } }), () =>
    prisma.websiteAnalyticsSnapshot.createMany({
      data: [
        { start: -92, visits: 1_820_000, unique: 1_240_000, conv: 41_200, rate: 2.26, sess: 152, social: 168_000, top: "Organic search" },
        { start: -61, visits: 1_910_000, unique: 1_290_000, conv: 43_900, rate: 2.3, sess: 158, social: 181_000, top: "Organic search" },
        { start: -30, visits: 2_040_000, unique: 1_350_000, conv: 47_800, rate: 2.34, sess: 161, social: 204_000, top: "Organic search" },
      ].map((w) => ({ clientId: id, periodStart: at(w.start), periodEnd: at(w.start + 29), visits: w.visits, uniqueVisitors: w.unique, conversions: w.conv, conversionRate: w.rate, avgSessionSeconds: w.sess, socialReferralVisits: w.social, topSource: w.top })),
    })
  );

  await block("brand sources + demo connections", () => prisma.brandSource.count({ where: { clientId: id, archivedAt: null } }), async () => {
    for (const app of ["google_drive", "figma"]) {
      const exists = await prisma.brandConnection.findFirst({ where: { clientId: id, app } });
      if (!exists) await prisma.brandConnection.create({ data: { clientId: id, app, status: "CONNECTED", connectedAt: at(-1), isDemo: true } });
    }
    await prisma.brandSource.createMany({
      data: [
        { clientId: id, app: "google_drive", url: "https://drive.google.com/", title: "Brand guidelines 2026.pdf", section: "our-brand", isDemo: true, createdByUserId: jack?.id },
        { clientId: id, app: "notion", url: "https://www.notion.so/klarna/Tone-of-voice", title: "Tone of voice", section: "our-brand", isDemo: false, createdByUserId: jack?.id },
        { clientId: id, app: "web", url: "https://www.klarna.com/international/about-us/", title: "klarna.com · About us", section: "our-brand", isDemo: false, createdByUserId: jack?.id },
        { clientId: id, app: "figma", url: "https://www.figma.com/", title: "Klarna Design System", section: "figma-design-system", isDemo: true, createdByUserId: jack?.id },
        { clientId: id, app: "google_drive", url: "https://drive.google.com/", title: "Campaign assets", isDemo: true, createdByUserId: jack?.id },
        { clientId: id, app: "figma", url: "https://www.figma.com/", title: "Logo suite", section: "visual-identity", isDemo: true, createdByUserId: jack?.id },
      ],
    });
  });

  // The client row: name the dummy sources and add a dummy card. Back up the row first.
  console.log(`- Klarna demo sources + dummy card: ${apply ? "writing" : "would write"}`);
  if (apply) {
    const dir = existsSync("/data") ? "/data/backups" : path.join(process.cwd(), "backups");
    mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `klarna-client-before-demo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
    writeFileSync(file, JSON.stringify(klarna, null, 1));
    console.log(`  backup: ${file}`);
    await prisma.client.update({ where: { id }, data: { demoSources: ["LinkedIn", "Google Analytics"], cardBrand: "Visa", cardLast4: "4242", cardExpiry: "12/28", cardIsDemo: true } });
  }
  console.log(apply ? "Applied." : "Dry run, nothing written.");
}

main().finally(() => prisma.$disconnect());
