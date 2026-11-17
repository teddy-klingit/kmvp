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

const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").replace(/[\s,%]/g, ""));
  return String(v ?? "").trim() && Number.isFinite(n) ? n : null;
};
const date = (v: FormDataEntryValue | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? new Date(`${v}T12:00:00Z`) : null);

/**
 * Phase X v2: a client goal (Insights → Overview "Your goals"), new or edited. Measured from the data layer
 * ("online_sales_yoy", target in %) or by hand ("manual", current against target). Logged.
 */
export async function saveGoalAction(formData: FormData) {
  const viewer = await requireOpsRole([...STAFF]);
  const clientId = String(formData.get("clientId") ?? "");
  const id = String(formData.get("id") ?? "");
  const title = String(formData.get("title") ?? "").trim().slice(0, 120);
  const target = num(formData.get("target"));
  if (!title || target === null || !(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) return;
  const measure = formData.get("measure") === "online_sales_yoy" ? "online_sales_yoy" : "manual";
  const data = {
    title,
    measure,
    target,
    current: measure === "manual" ? num(formData.get("current")) : null,
    unit: String(formData.get("unit") ?? "").trim().slice(0, 30) || null,
    startAt: date(formData.get("startAt")),
    dueAt: date(formData.get("dueAt")),
    note: String(formData.get("note") ?? "").trim().slice(0, 140) || null,
    setByUserId: viewer.userId,
  };
  const existing = id ? await prisma.clientGoal.findFirst({ where: { id, clientId } }) : null;
  if (existing) await prisma.clientGoal.update({ where: { id: existing.id }, data });
  else await prisma.clientGoal.create({ data: { ...data, clientId, sortOrder: await prisma.clientGoal.count({ where: { clientId } }) } });
  await prisma.auditLog.create({ data: { clientId, actorUserId: viewer.userId, area: "insights", action: `${existing ? "Edited" : "Added"} goal “${title}”` } });
  refresh(clientId);
}

export async function deleteGoalAction(formData: FormData) {
  const viewer = await requireOpsRole([...STAFF]);
  const clientId = String(formData.get("clientId") ?? "");
  const goal = await prisma.clientGoal.findFirst({ where: { id: String(formData.get("id") ?? ""), clientId } });
  if (!goal) return;
  await prisma.clientGoal.delete({ where: { id: goal.id } });
  await prisma.auditLog.create({ data: { clientId, actorUserId: viewer.userId, area: "insights", action: `Removed goal “${goal.title}”` } });
  refresh(clientId);
}
