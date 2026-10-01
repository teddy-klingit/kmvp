/**
 * Reverses the 2026-10-01 Klarna demo cleanup. Every row it touches was
 * soft-deleted (status ARCHIVED / archivedAt set), never removed — this puts
 * each one back exactly as it was. Full pre-cleanup rows are in
 * backups/klarna-cleanup-2026-10-01.json.
 *
 *   npx tsx scripts/restore-klarna-cleanup-2026-10-01.ts            # restore everything
 *   npx tsx scripts/restore-klarna-cleanup-2026-10-01.ts <id> [...]  # restore only these ids
 */
import { prisma } from "../src/lib/prisma";
import type { ProjectStatus } from "../src/generated/prisma";

const PROJECTS: Record<string, ProjectStatus> = {
  cmt7smmly0003q842iv2ovk9h: "DRAFT", // Klarna Checkout-Moment Vertical Story Ads
  cmt8dwpg6000jq842a4a8rsc2: "DRAFT", // Good Boy — "5:47" Awareness Campaign
  cmt8fryxl000zq842dk431bna: "DRAFT", // Klarna Presentation Deck
  cmt8gosfh001fq842qyjk7eol: "IN_PRODUCTION", // Klarna Investor Pitch Deck (10 Slides)
  cmtsrpld2002rpi43skrqx72m: "DRAFT", // Receipt-to-Story: Vertical Cost-Transparency Explainers
  cmtwocuyz0003o545yapz6lys: "DRAFT", // Klarna 10-Slide Sales Deck
  cmtwodcy0000jo545w1h9oprq: "BRIEFING", // Klarna 10-Slide Deck
  cmu6tkk59002hmp43eeh9p624: "BRIEFING", // Klarna 10-Slide PowerPoint Deck
  cmucc7kia004omp43wrq5ddla: "IN_PRODUCTION", // Klarna 10-Page Presentation
};
const COMMENTS = ["cmumhpr63001ioe4272kjr2cl"]; // "ivo"
const NOTIFICATIONS = [
  "cmumh90iv001coe42rbfjz6ux", // Performance drop — repeat, 2026-09-29
  "cmunum50f003coe42urc29t9v", // Performance drop — repeat, 2026-09-30
  "cmup99rvh0049oe42ze8jh54m", // Estimate approval — 10-Page Presentation
];
const MARKET_SIGNALS = ["cmumh90ib001aoe42nzjmsafw", "cmunum4zx003aoe42tpqjwfyr"];

async function main() {
  const only = new Set(process.argv.slice(2));
  const pick = (id: string) => only.size === 0 || only.has(id);

  for (const [id, status] of Object.entries(PROJECTS)) {
    if (!pick(id)) continue;
    const updated = await prisma.project.updateMany({ where: { id, status: "ARCHIVED" }, data: { status } });
    console.log(`project ${id} → ${status}${updated.count ? "" : " (skipped: not currently ARCHIVED)"}`);
  }
  const ids = (list: string[]) => list.filter(pick);
  const c = await prisma.comment.updateMany({ where: { id: { in: ids(COMMENTS) } }, data: { archivedAt: null } });
  const n = await prisma.notification.updateMany({ where: { id: { in: ids(NOTIFICATIONS) } }, data: { archivedAt: null } });
  const s = await prisma.marketSignal.updateMany({ where: { id: { in: ids(MARKET_SIGNALS) } }, data: { archivedAt: null } });
  console.log(`restored comments=${c.count} notifications=${n.count} marketSignals=${s.count}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
