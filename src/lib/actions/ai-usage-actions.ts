"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";
import { getSetting, setSetting } from "@/lib/platform-settings";
import { aiCreditStatus } from "@/lib/ai-credits";
import { sendPmMessage } from "@/lib/pm-thread";

/** Admin → AI usage (Phase U): every number here is a staff-editable placeholder; every change is logged. */

/** A number from a form field; a missing or blank field is null (never 0). */
const num = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").replace(",", ".").replace(/[$€%\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const back = (msg: string) => {
  revalidatePath("/ops/admin/ai-usage");
  redirect(`/ops/admin/ai-usage?ok=${encodeURIComponent(msg)}`);
};

export async function saveAiPlansAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const perCredit = num(formData.get("usdPerCredit"));
  if (perCredit && perCredit > 0 && perCredit !== (await getSetting("usdPerCredit"))) await setSetting("usdPerCredit", perCredit, viewer.userId);
  const usd = perCredit && perCredit > 0 ? perCredit : await getSetting("usdPerCredit");
  for (const p of await prisma.platformPlan.findMany()) {
    const budget = num(formData.get(`budget_${p.key}`));
    if (budget == null || budget < 0 || budget === p.aiBudgetUsd) continue;
    await prisma.platformPlan.update({ where: { key: p.key }, data: { aiBudgetUsd: budget, aiCreditsPerMonth: Math.round(budget / usd) } });
    await prisma.auditLog.create({ data: { actorUserId: viewer.userId, area: "pricing", action: `AI budget of ${p.name} set to $${budget}`, before: { aiBudgetUsd: p.aiBudgetUsd }, after: { aiBudgetUsd: budget, credits: Math.round(budget / usd) } } });
  }
  back("AI budgets saved.");
}

export async function saveTopUpRulesAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const warn = num(formData.get("warnAt"));
  if (warn && warn > 0 && warn <= 100) await setSetting("aiWarnAt", warn / 100, viewer.userId);
  const at100 = formData.get("at100") === "bill" ? "bill" : "pause";
  await setSetting("aiAt100", at100, viewer.userId);
  await setSetting("topUpApproval", formData.get("approval") === "staff" ? "staff" : "instant", viewer.userId);
  const max = num(formData.get("maxPerMonth"));
  if (max != null && max >= 0) await setSetting("topUpMaxEurPerMonth", max, viewer.userId);
  await setSetting("topUpRollover", formData.get("rollover") !== "no", viewer.userId);
  const options = (await getSetting("aiTopUpOptions")).map((o, i) => ({ credits: num(formData.get(`credits_${i}`)) ?? o.credits, priceEur: num(formData.get(`price_${i}`)) ?? o.priceEur }));
  await setSetting("aiTopUpOptions", options, viewer.userId);
  back("Top-up rules saved.");
}

export async function saveCostControlAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN"]);
  const prices = await getSetting("aiPrices");
  const models = Object.fromEntries(Object.entries(prices.models).map(([m, p]) => [m, { in: num(formData.get(`in_${m}`)) ?? p.in, out: num(formData.get(`out_${m}`)) ?? p.out }]));
  await setSetting("aiPrices", { ...prices, models, image: num(formData.get("image")) ?? prices.image, webSearch: num(formData.get("webSearch")) ?? prices.webSearch }, viewer.userId);
  const routing = await getSetting("aiRouting");
  const list = (k: string) => String(formData.get(k) ?? "").split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
  await setSetting("aiRouting", { ...routing, simpleSkills: list("simpleSkills"), opusSkills: list("opusSkills") }, viewer.userId);
  await setSetting("promptCaching", formData.get("caching") === "on", viewer.userId);
  await setSetting("batchScheduledReports", formData.get("batch") === "on", viewer.userId);
  const fx = num(formData.get("eurUsd"));
  if (fx && fx > 0) await setSetting("eurUsdRate", fx, viewer.userId);
  back("Cost control saved.");
}

/** "Offer top-up": a ready-made message from Klingit in the client's PM thread, with the top-up one click away. */
export async function offerTopUpAction(formData: FormData) {
  const viewer = await requireOpsRole(["ADMIN", "PM"]);
  const clientId = String(formData.get("clientId") ?? "");
  const s = await aiCreditStatus(clientId);
  const owner = await prisma.clientUser.findFirst({ where: { clientId, permission: "OWNER" }, include: { user: { select: { name: true } } } });
  const pct = s.allowance ? Math.round((s.used / s.allowance) * 100) : 0;
  await sendPmMessage({
    clientId,
    author: { userId: viewer.userId, clientUserId: null, name: viewer.user.name },
    body: `Hi ${owner?.user.name.split(" ")[0] ?? "there"}, you've used ${pct}% of this month's AI credits (${Math.round(s.left).toLocaleString("en-GB")} left). If you need more, a top-up is one click: Home → Top up. Credits are added right away and roll over.`,
  });
  await prisma.auditLog.create({ data: { clientId, actorUserId: viewer.userId, area: "billing", action: "Offered an AI top-up", after: { pct } } });
  back("Offer sent in their messages.");
}
