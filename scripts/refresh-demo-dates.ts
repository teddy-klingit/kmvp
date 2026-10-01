/**
 * Re-anchors the Klarna demo to today on an existing database (production was seeded in August,
 * so its demo projects read "overdue since 24 Aug"). For each demo project in prisma/demo-dates.ts it
 * shifts EVERY date on that project — project, stages, brief, estimate, team, assets, comments — by the
 * same amount, so the story stays internally consistent and the due date lands where the seed puts it.
 * Klarna touchpoints and credit-ledger rows shift with the flagship project.
 *
 * It also backfills competitor alert dedupe keys and soft-archives repeats of the same competitor
 * within 7 days (never deletes).
 *
 * A JSON backup of every row it changes is written first. Dry run by default:
 *   npx tsx scripts/refresh-demo-dates.ts            # report only
 *   npx tsx scripts/refresh-demo-dates.ts --apply    # write
 */
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma";
import { DEMO_DUE_IN_DAYS, DAY_MS, daysFromToday } from "../prisma/demo-dates";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const backup: Record<string, unknown[]> = {};
const keep = (table: string, rows: unknown[]) => (backup[table] = [...(backup[table] ?? []), ...rows]);
const shift = (d: Date | null, ms: number) => (d ? new Date(d.getTime() + ms) : null);

async function main() {
  const klarna = await prisma.client.findUnique({ where: { slug: "klarna" } });
  if (!klarna) throw new Error("No Klarna client.");
  const now = new Date();
  let flagshipShift = 0;

  for (const [name, dueInDays] of Object.entries(DEMO_DUE_IN_DAYS)) {
    const project = await prisma.project.findFirst({ where: { clientId: klarna.id, name, status: { not: "ARCHIVED" } } });
    if (!project?.dueDate) {
      console.log(`- ${name}: not found or no due date, skipped`);
      continue;
    }
    const target = daysFromToday(dueInDays, now);
    const ms = Math.round((target.getTime() - project.dueDate.getTime()) / DAY_MS) * DAY_MS;
    if (name === "Q3 App install campaign") flagshipShift = ms;
    console.log(`- ${name}: due ${project.dueDate.toISOString().slice(0, 10)} → ${new Date(project.dueDate.getTime() + ms).toISOString().slice(0, 10)} (${ms / DAY_MS} days)`);
    if (ms === 0) continue;

    const [stages, brief, estimate, team, assets, comments] = await Promise.all([
      prisma.pipelineStage.findMany({ where: { projectId: project.id } }),
      prisma.brief.findUnique({ where: { projectId: project.id } }),
      prisma.estimate.findUnique({ where: { projectId: project.id } }),
      prisma.team.findUnique({ where: { projectId: project.id } }),
      prisma.asset.findMany({ where: { projectId: project.id } }),
      prisma.comment.findMany({ where: { projectId: project.id } }),
    ]);
    keep("project", [project]);
    keep("pipelineStage", stages);
    keep("brief", brief ? [brief] : []);
    keep("estimate", estimate ? [estimate] : []);
    keep("team", team ? [team] : []);
    keep("asset", assets.map((a) => ({ id: a.id, createdAt: a.createdAt })));
    keep("comment", comments.map((c) => ({ id: c.id, createdAt: c.createdAt })));
    if (!apply) continue;

    await prisma.project.update({
      where: { id: project.id },
      data: { dueDate: shift(project.dueDate, ms), startedAt: shift(project.startedAt, ms), deliveredAt: shift(project.deliveredAt, ms) },
    });
    for (const s of stages) {
      await prisma.pipelineStage.update({ where: { id: s.id }, data: { startedAt: shift(s.startedAt, ms), completedAt: shift(s.completedAt, ms), etaAt: shift(s.etaAt, ms) } });
    }
    if (brief) await prisma.brief.update({ where: { id: brief.id }, data: { submittedAt: shift(brief.submittedAt, ms), acceptedAt: shift(brief.acceptedAt, ms) } });
    if (estimate) {
      await prisma.estimate.update({ where: { id: estimate.id }, data: { sentAt: shift(estimate.sentAt, ms), expiresAt: shift(estimate.expiresAt, ms), respondedAt: shift(estimate.respondedAt, ms) } });
    }
    if (team) await prisma.team.update({ where: { id: team.id }, data: { confirmedAt: shift(team.confirmedAt, ms) } });
    for (const a of assets) await prisma.asset.update({ where: { id: a.id }, data: { createdAt: shift(a.createdAt, ms)! } });
    for (const c of comments) await prisma.comment.update({ where: { id: c.id }, data: { createdAt: shift(c.createdAt, ms)! } });
  }

  if (flagshipShift !== 0) {
    const [touchpoints, ledger] = await Promise.all([
      prisma.touchpoint.findMany({ where: { clientId: klarna.id } }),
      prisma.creditLedgerEntry.findMany({ where: { clientId: klarna.id } }),
    ]);
    keep("touchpoint", touchpoints);
    keep("creditLedgerEntry", ledger.map((l) => ({ id: l.id, createdAt: l.createdAt })));
    console.log(`- ${touchpoints.length} touchpoints and ${ledger.length} ledger rows shift ${flagshipShift / DAY_MS} days`);
    if (apply) {
      for (const t of touchpoints) await prisma.touchpoint.update({ where: { id: t.id }, data: { scheduledAt: shift(t.scheduledAt, flagshipShift)! } });
      for (const l of ledger) await prisma.creditLedgerEntry.update({ where: { id: l.id }, data: { createdAt: shift(l.createdAt, flagshipShift)! } });
    }
  }

  // Competitor alerts: one per competitor per 7 days, as the code now records them.
  const competitor = await prisma.marketSignal.findMany({ where: { type: "COMPETITOR", archivedAt: null }, orderBy: { publishedAt: "asc" } });
  const lastKept = new Map<string, Date>();
  const repeats: typeof competitor = [];
  for (const s of competitor) {
    const brand = s.title.match(/^(.+?) launched \d+ new ad/)?.[1] ?? s.title.match(/^(.+?)['’]s ad volume/)?.[1];
    if (!brand) continue;
    const key = `${s.clientId}|competitor:${brand.trim().toLowerCase()}`;
    const prev = lastKept.get(key);
    if (prev && s.publishedAt.getTime() - prev.getTime() < 7 * DAY_MS) repeats.push(s);
    else lastKept.set(key, s.publishedAt);
    if (apply && !s.dedupeKey) await prisma.marketSignal.update({ where: { id: s.id }, data: { dedupeKey: `competitor:${brand.trim().toLowerCase()}` } });
  }
  keep("marketSignal", repeats);
  console.log(`- ${repeats.length} repeat competitor alerts within 7 days ${apply ? "archived" : "would be archived"}`);
  if (apply && repeats.length) {
    await prisma.marketSignal.updateMany({ where: { id: { in: repeats.map((r) => r.id) } }, data: { archivedAt: now } });
  }

  const dir = existsSync("/data") ? "/data/backups" : path.join(process.cwd(), "backups");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `refresh-demo-dates-${now.toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log(`${apply ? "Applied." : "Dry run, nothing written."} Backup of the original rows: ${file}`);
}

main().finally(() => prisma.$disconnect());
