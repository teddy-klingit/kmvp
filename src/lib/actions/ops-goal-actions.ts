"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";

/** Who sets a client's goals and ad budget: its PM, or an admin. */
const STAFF = ["ADMIN", "PM"] as const;

function refresh(clientId: string) {
  revalidatePath(`/ops/clients/${clientId}/goals`);
  revalidatePath("/insights", "layout");
}

/**
 * Phase X v2: the client's planned ad spend for a month, whole or split by channel (Insights → Paid ads pacing).
 * An empty amount removes that line. Every change is in the client's audit log.
 */
export async function setAdBudgetAction(formData: FormData) {
  const viewer = await requireOpsRole([...STAFF]);
  const clientId = String(formData.get("clientId") ?? "");
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  const month = String(formData.get("month") ?? "");
  if (!client || !/^\d{4}-\d{2}$/.test(month)) return;
  const currency = String(formData.get("currency") ?? "EUR").slice(0, 3).toUpperCase() || "EUR";
  for (const channel of ["", "Meta", "Google", "LinkedIn", "TikTok"]) {
    const raw = String(formData.get(`amount:${channel || "all"}`) ?? "").replace(/[\s,]/g, "");
    const key = { clientId_month_channel: { clientId, month, channel } };
    const before = await prisma.adBudget.findUnique({ where: key });
    if (!raw) {
      if (before) await prisma.adBudget.delete({ where: key });
      continue;
    }
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0 || amount === before?.amount) continue;
    await prisma.adBudget.upsert({ where: key, update: { amount, currency, setByUserId: viewer.userId }, create: { clientId, month, channel, amount, currency, setByUserId: viewer.userId } });
    await prisma.auditLog.create({ data: { clientId, actorUserId: viewer.userId, area: "insights", action: `Ad budget ${month}${channel ? ` · ${channel}` : ""}: ${before ? `${before.amount} → ` : ""}${amount} ${currency}` } });
  }
  refresh(clientId);
}
