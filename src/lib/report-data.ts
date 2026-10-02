import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";
import { loadMeasuredAssets, loadPaidMedia } from "@/lib/insights-data";
import { synthesizeReportTakeaways } from "@/lib/ai/agents/report-agent";

/**
 * Reports (Reports.dc.html): periods, the agent-written report for each closed period, past reports and
 * the send schedule. A report is written once its period has closed: the week after Sunday, the month
 * after its last day.
 */
export type ReportKind = "WEEKLY" | "MONTHLY";
export type Period = { kind: ReportKind; start: Date; end: Date; label: string; range: string };

const DAY = 86400000;
const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", o).format(d);

/** ISO week number (weeks start Monday; week 1 holds the year's first Thursday). */
export function isoWeek(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7);
}

/** "28 Sept – 4 Oct", "21 – 27 Sept". */
function rangeLabel(start: Date, end: Date) {
  return start.getMonth() === end.getMonth() ? `${start.getDate()} – ${fmt(end, { day: "numeric", month: "short" })}` : `${fmt(start, { day: "numeric", month: "short" })} – ${fmt(end, { day: "numeric", month: "short" })}`;
}

export function weekOf(d: Date): Period {
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { kind: "WEEKLY", start, end, label: `Week ${isoWeek(start)}`, range: rangeLabel(start, end) };
}

export function monthOf(d: Date): Period {
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return { kind: "MONTHLY", start, end, label: fmt(start, { month: "long", year: "numeric" }), range: fmt(start, { month: "long" }) };
}

/** The most recent period that has fully ended. */
export function lastClosed(kind: ReportKind, now = new Date()): Period {
  if (kind === "WEEKLY") return weekOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7));
  return monthOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));
}

export function periodFor(kind: ReportKind, start: Date): Period {
  return kind === "WEEKLY" ? weekOf(start) : monthOf(start);
}

/** Writes (or rewrites) one period's report from the data known now. */
export async function writeReport(clientId: string, period: Period): Promise<{ ok: true } | { ok: false; error: string }> {
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true } });
  const endExclusive = new Date(period.end.getTime() + DAY);
  const [posts, targets, paid, { measured }, signals] = await Promise.all([
    prisma.contentPost.findMany({ where: { clientId, status: "PUBLISHED", publishedDate: { gte: period.start, lt: endExclusive } } }),
    prisma.contentPlanTarget.findMany({ where: { clientId } }),
    loadPaidMedia(clientId),
    loadMeasuredAssets(clientId),
    prisma.marketSignal.findMany({ where: { clientId, archivedAt: null, publishedAt: { gte: period.start, lt: endExclusive } }, take: 12 }),
  ]);
  const weekly = targets.reduce((s, t) => s + t.weeklyVolume, 0);
  const top = [...measured].sort((a, b) => b.ctr - a.ctr).slice(0, 3);
  if (posts.length === 0 && paid.campaigns.length === 0 && measured.length === 0) return { ok: false, error: "No data for this period yet." };

  const result = await synthesizeReportTakeaways({
    clientId,
    clientName: client.name,
    kind: period.kind,
    periodLabel: `${period.label} · ${period.range}`,
    postsInPeriod: posts.map((p) => ({ title: p.title, platform: p.platform, contentType: p.contentType, engagementRate: p.engagementRate, impressions: p.impressions })),
    sowMinimum: weekly ? (period.kind === "WEEKLY" ? weekly : weekly * 4) : null,
    paid: paid.campaigns,
    assets: measured.map((a) => ({ name: a.title, project: a.project, format: a.format, ctr: a.ctr })),
    signals: signals.map((s) => ({ type: s.type, title: s.title })),
  });
  if (!result.ok) return { ok: false, error: result.error };

  const data = { label: period.label, periodEnd: period.end, takeaways: result.data.takeaways.slice(0, 3), topAssetIds: top.map((a) => a.id), generatedAt: new Date() };
  await prisma.generatedReport.upsert({
    where: { clientId_kind_periodStart: { clientId, kind: period.kind, periodStart: period.start } },
    update: data,
    create: { clientId, kind: period.kind, periodStart: period.start, ...data },
  });
  return { ok: true };
}

const inFlight = new Set<string>();

/**
 * After the response: writes the latest closed week's and month's reports if they don't exist yet.
 * INSIGHTS_AGENT_ON_PAGE_LOAD=0 freezes it (screenshots). TODO: move to a cron on the send schedule.
 */
export function scheduleReports(clientId: string, missing: Period[]) {
  if (process.env.INSIGHTS_AGENT_ON_PAGE_LOAD === "0" || missing.length === 0) return;
  try {
    after(async () => {
      for (const p of missing) {
        const key = `${clientId}:${p.kind}:${p.start.toISOString()}`;
        if (inFlight.has(key)) continue;
        inFlight.add(key);
        try {
          await writeReport(clientId, p);
        } catch (err) {
          console.error("report run failed", err);
        } finally {
          inFlight.delete(key);
        }
      }
    });
  } catch {
    // No request scope.
  }
}

/** The latest closed period's report of a kind, plus the ones before it. Schedules a missing latest one. */
export async function loadReports(clientId: string, kind: ReportKind, now = new Date()) {
  const latest = lastClosed(kind, now);
  const rows = await prisma.generatedReport.findMany({ where: { clientId, kind }, orderBy: { periodStart: "desc" }, take: 8 });
  const current = rows.find((r) => r.periodStart.getTime() === latest.start.getTime()) ?? null;
  if (!current) scheduleReports(clientId, [latest]);
  return { latest, current, earlier: rows.filter((r) => r !== current) };
}

export type ReportTakeaway = { title: string; detail: string };

export function reportTakeaways(r: { takeaways: unknown }) {
  return jsonArray<ReportTakeaway>(r.takeaways).slice(0, 3);
}

/** Top creative for a report, with names and formats (assets the client can still see). */
export async function reportAssets(clientId: string, ids: unknown) {
  const list = jsonArray<string>(ids);
  if (list.length === 0) return [];
  const { measured } = await loadMeasuredAssets(clientId);
  return list.map((id) => measured.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => Boolean(a));
}

// ─── Send schedule ─────────────────────────────────────────────────────────

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export async function loadSchedule(clientId: string) {
  const [config, team] = await Promise.all([
    prisma.clientReportingConfig.findUnique({ where: { clientId } }),
    prisma.clientUser.findMany({ where: { clientId, user: { status: { not: "SUSPENDED" } } }, include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const chosen = config?.recipientUserIds ? jsonArray<string>(config.recipientUserIds) : null;
  const recipients = team.filter((m) => (chosen ? chosen.includes(m.user.id) : m.permission === "OWNER"));
  return {
    cadence: config?.cadence ?? "WEEKLY",
    day: config?.sendDay ?? 1,
    time: config?.sendTime ?? "08:00",
    recipients: recipients.map((m) => ({ id: m.user.id, name: m.user.name })),
    team: team.map((m) => ({ id: m.user.id, name: m.user.name, chosen: recipients.some((r) => r.id === m.user.id) })),
  };
}
