"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { entitlements } from "@/lib/entitlements";

/**
 * Phase V: monthly store sales, uploaded as CSV (Enterprise). One line per month and market:
 *   month,market,revenue[,orders]   e.g. 2026-09,SE,12500,140
 * Stored as totals in the data layer (source "Offline"), kept apart from marketing revenue. Logged.
 */
export async function uploadStoreSalesAction(formData: FormData) {
  const viewer = await getPortalViewer();
  const back = (msg: string) => redirect(`/insights/revenue?upload=${encodeURIComponent(msg)}#cant-see`);
  if (!isClientAdmin(viewer)) back("Only your account's admins can upload sales.");
  const ent = await entitlements(viewer.clientId);
  if (!ent.has("offlineUpload")) back(`Store sales upload is on ${ent.needs("offlineUpload")}.`);
  const file = formData.get("file");
  const text = file instanceof File ? await file.text() : String(formData.get("csv") ?? "");
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^month/i.test(l));
  const rows: { date: string; market: string; revenue: number; orders: number | null }[] = [];
  for (const [i, l] of lines.entries()) {
    const [month, market, revenue, orders] = l.split(/[,;\t]/).map((x) => x.trim());
    const r = Number(revenue?.replace(/\s/g, ""));
    if (!/^\d{4}-\d{2}$/.test(month ?? "") || !Number.isFinite(r) || r < 0) back(`Line ${i + 1} isn't "month,market,revenue[,orders]".`);
    rows.push({ date: `${month}-01`, market: (market ?? "").toUpperCase().slice(0, 8), revenue: r, orders: orders ? Number(orders) : null });
  }
  if (!rows.length) back("The file had no lines to read.");
  const currency = (await prisma.metricDaily.findFirst({ where: { clientId: viewer.clientId, metric: { in: ["revenue", "won_value"] } }, select: { currency: true } }))?.currency ?? "EUR";
  await prisma.$transaction([
    ...rows.map((r) => prisma.metricDaily.deleteMany({ where: { clientId: viewer.clientId, source: "Offline", date: r.date, market: r.market, metric: { in: ["store_revenue", "store_orders"] } } })),
    prisma.metricDaily.createMany({
      data: rows.flatMap((r) => [
        { clientId: viewer.clientId, date: r.date, source: "Offline", channel: "In store", market: r.market, path: "retail", metric: "store_revenue", value: r.revenue, currency },
        ...(r.orders != null && Number.isFinite(r.orders) ? [{ clientId: viewer.clientId, date: r.date, source: "Offline", channel: "In store", market: r.market, path: "retail", metric: "store_orders", value: r.orders, currency }] : []),
      ]),
    }),
    prisma.dataSource.upsert({ where: { clientId_source: { clientId: viewer.clientId, source: "Offline" } }, update: { status: "connected", lastSyncAt: new Date() }, create: { clientId: viewer.clientId, source: "Offline", status: "connected", account: "Uploaded", lastSyncAt: new Date(), connectedAt: new Date() } }),
    prisma.auditLog.create({ data: { clientId: viewer.clientId, actorUserId: viewer.userId, area: "connections", action: `Uploaded store sales: ${rows.length} month${rows.length === 1 ? "" : "s"} (${rows[0].date.slice(0, 7)}–${rows.at(-1)!.date.slice(0, 7)})` } }),
  ]);
  revalidatePath("/insights/revenue");
  back(`Store sales uploaded: ${rows.length} line${rows.length === 1 ? "" : "s"}.`);
}
