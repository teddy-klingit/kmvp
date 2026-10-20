import { prisma } from "@/lib/prisma";
import { DEMO_ACCOUNT, guessStage, type SalesSettings } from "@/lib/sales-sources";

/**
 * Phase V demo (V6): ouhers' sales sources. Shopify (online), HubSpot (retail and wholesale pipeline) and Klaviyo are
 * connected demo sources; a staff-only switch shows HubSpot as "Setting up" (step 2, map stages) instead.
 */

const MIN = 60000;

function settingsFor(source: "Shopify" | "HubSpot" | "Klaviyo", login: string): SalesSettings {
  const d = DEMO_ACCOUNT[source];
  return { login, domain: d.domain, stages: d.stages?.map((s) => ({ ...s, mapTo: guessStage(s.name) })), pipelines: d.pipelines.map((name) => ({ name, selected: true })), currency: d.currency, historyMonths: 12 };
}

export async function seedPhaseVSources(ctx: { clientId: string; now: Date; login: string }) {
  const { clientId, now, login } = ctx;
  const rows = [
    { source: "Shopify" as const, account: "ouhers.com", lastSyncAt: new Date(now.getTime() - 10 * MIN) },
    { source: "HubSpot" as const, account: "ouhers (retail & wholesale)", lastSyncAt: new Date(now.getTime() - 25 * MIN) },
    { source: "Klaviyo" as const, account: "ouhers", lastSyncAt: new Date(now.getTime() - 60 * MIN) },
  ];
  for (const r of rows) {
    const data = { status: "connected", account: r.account, lastSyncAt: r.lastSyncAt, connectedAt: new Date(now.getTime() - 120 * 86400000), settings: settingsFor(r.source, login), health: DEMO_ACCOUNT[r.source].health ?? undefined, isDemo: true };
    await prisma.dataSource.upsert({ where: { clientId_source: { clientId, source: r.source } }, update: data, create: { clientId, source: r.source, ...data } });
  }
}

/** The second demo state: HubSpot half-way through its set-up (logged in, mapping stages), or back to connected. */
export async function setDemoHubSpotState(clientId: string, state: "connected" | "setting_up") {
  const ds = await prisma.dataSource.findUnique({ where: { clientId_source: { clientId, source: "HubSpot" } } });
  if (!ds?.isDemo) return false;
  const settings = (ds.settings ?? {}) as SalesSettings;
  await prisma.dataSource.update({ where: { id: ds.id }, data: { status: state, settings: { ...settings, step: state === "setting_up" ? 2 : undefined } } });
  return true;
}
