import { prisma } from "@/lib/prisma";

/**
 * Phase V: the one data layer per client (MetricDaily). Every source writes its numbers here through its sync job,
 * one number per row; every feature reads them back from here. Never a source's API at request time, and never
 * another client's rows: every read takes the client id.
 */

/** Ad platforms, as stored in MetricDaily.source. */
export const AD_SOURCES = ["Meta", "Google", "LinkedIn", "TikTok"] as const;
const AD_METRICS = ["impressions", "clicks", "spend", "conversions"] as const;

/** The channel an ad platform's own numbers are credited to. */
export const adChannel = (platform: string) => (platform === "Google" ? "Google Ads" : platform === "LinkedIn" ? "LinkedIn Ads" : platform);

/** One campaign's day on an ad platform, rebuilt from its MetricDaily rows. */
export type AdDay = { platform: string; campaignId: string; campaignName: string; accountName: string; currency: string; date: string; impressions: number; clicks: number; spend: number; conversions: number };

/** A client's ad days since `since` (YYYY-MM-DD), optionally one platform, oldest first. */
export async function adDays(clientId: string, opts: { since?: string; platform?: string | null } = {}): Promise<AdDay[]> {
  const rows = await prisma.metricDaily.findMany({
    where: { clientId, source: opts.platform ? opts.platform : { in: [...AD_SOURCES] }, model: "", metric: { in: [...AD_METRICS] }, ...(opts.since ? { date: { gte: opts.since } } : {}) },
    orderBy: { date: "asc" },
  });
  const days = new Map<string, AdDay>();
  for (const r of rows) {
    const key = `${r.source}|${r.campaignId}|${r.date}`;
    const d = days.get(key) ?? { platform: r.source, campaignId: r.campaignId, campaignName: r.campaignName, accountName: r.accountName, currency: r.currency, date: r.date, impressions: 0, clicks: 0, spend: 0, conversions: 0 };
    d[r.metric as (typeof AD_METRICS)[number]] += r.value;
    days.set(key, d);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** The ad platforms a client has numbers from (any date). */
export async function adPlatforms(clientId: string) {
  const rows = await prisma.metricDaily.findMany({ where: { clientId, source: { in: [...AD_SOURCES] } }, select: { source: true }, distinct: ["source"] });
  return rows.map((r) => r.source);
}

/**
 * Replaces a platform's ad days from `since` on with what the platform just returned (platforms keep adjusting recent
 * days). A campaign's utm_campaign comes from staff's campaign mapping when the platform carries no UTM.
 */
export async function writeAdDays(clientId: string, platform: string, account: { name: string; currency: string }, since: string, rows: Omit<AdDay, "platform" | "accountName" | "currency">[]) {
  const mapping = new Map((await prisma.campaignMapping.findMany({ where: { clientId, source: platform } })).map((m) => [m.campaignId, m.utmCampaign]));
  const data = rows.flatMap((r) =>
    AD_METRICS.map((metric) => ({ clientId, date: r.date, source: platform, channel: adChannel(platform), campaignId: r.campaignId, campaignName: r.campaignName, accountName: account.name, utmCampaign: mapping.get(r.campaignId) ?? "", metric, value: r[metric], currency: account.currency }))
  );
  await prisma.$transaction([
    prisma.metricDaily.deleteMany({ where: { clientId, source: platform, model: "", metric: { in: [...AD_METRICS] }, date: { gte: since } } }),
    prisma.metricDaily.createMany({ data }),
  ]);
}

/** Records a source's sync result: connected with its time, or the error it gave. */
export async function recordSync(clientId: string, source: string, r: { ok: true; account?: string | null } | { ok: false; error: string; reconnect?: boolean }, now = new Date()) {
  const base = r.ok ? { status: "connected", lastSyncAt: now, lastError: null, ...(r.account ? { account: r.account } : {}) } : { status: r.reconnect ? "needs_reconnect" : "error", lastError: r.error };
  await prisma.dataSource.upsert({ where: { clientId_source: { clientId, source } }, update: base, create: { clientId, source, connectedAt: r.ok ? now : null, ...base } });
}

/** When the client's ad numbers were last synced, and whether that's older than `staleMs`. */
export async function adFreshness(clientId: string, staleMs: number) {
  const latest = await prisma.dataSource.findFirst({ where: { clientId, source: { in: [...AD_SOURCES] }, lastSyncAt: { not: null } }, orderBy: { lastSyncAt: "desc" }, select: { lastSyncAt: true } });
  const at = latest?.lastSyncAt ?? null;
  return { lastSynced: at, stale: !at || Date.now() - at.getTime() > staleMs };
}

/** Sources set up for a client that failed their last sync (shown as an error with Reconnect, never hidden). */
export async function sourceErrors(clientId: string) {
  return prisma.dataSource.findMany({ where: { clientId, status: { in: ["error", "needs_reconnect"] } }, select: { source: true, status: true, lastError: true } });
}

/** A client's ad campaigns over the last `days` days, totalled from the data layer (the shape Insights shows). */
export async function adCampaigns(clientId: string, days = 30, now = new Date()) {
  const since = new Date(now.getTime() - (days - 1) * 86400000).toISOString().slice(0, 10);
  const byCampaign = new Map<string, AdDay>();
  for (const d of await adDays(clientId, { since })) {
    const key = `${d.platform}|${d.campaignId}`;
    const c = byCampaign.get(key) ?? { ...d, impressions: 0, clicks: 0, spend: 0, conversions: 0 };
    c.impressions += d.impressions;
    c.clicks += d.clicks;
    c.spend += d.spend;
    c.conversions += d.conversions;
    c.campaignName = d.campaignName;
    byCampaign.set(key, c);
  }
  return [...byCampaign.values()].map((c) => {
    const spend = Math.round(c.spend);
    const conversions = Math.round(c.conversions);
    return { platform: c.platform, accountName: c.accountName, currency: c.currency, campaignId: c.campaignId, campaignName: c.campaignName, impressions: c.impressions, clicks: c.clicks, ctr: c.impressions ? Math.round((c.clicks / c.impressions) * 10000) / 100 : 0, spend, conversions, costPerConversion: conversions ? Math.round(spend / conversions) : null };
  });
}

/**
 * Phase V: a disconnected source's synced numbers are deleted once its 30 days are up (every client, demo too).
 * Logged per source; the DataSource row stays, so the client can see it was disconnected and when.
 */
export async function purgeDisconnectedSources(now = new Date()) {
  const due = await prisma.dataSource.findMany({ where: { status: "disconnected", purgeAfter: { not: null, lte: now } } });
  for (const ds of due) {
    const { count } = await prisma.metricDaily.deleteMany({ where: { clientId: ds.clientId, source: ds.source } });
    await prisma.dataSource.update({ where: { id: ds.id }, data: { purgeAfter: null, lastError: `Synced data deleted ${now.toISOString().slice(0, 10)}` } });
    await prisma.auditLog.create({ data: { clientId: ds.clientId, area: "connections", action: `Deleted ${count} synced numbers from ${ds.source}, 30 days after it was disconnected` } });
  }
  return due.length;
}
