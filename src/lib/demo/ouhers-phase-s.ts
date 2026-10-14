import { prisma } from "@/lib/prisma";
import { PIPELINE_STAGE_ORDER } from "@/lib/labels";
import { createContract } from "@/lib/contracts";
import { ensureGrants, poolBalance, teamBalances, type Pool } from "@/lib/team-ledger";
import { billingProfile, generateDueInvoices, markInvoicePaid, sendInvoice } from "@/lib/invoicing";
import { createRequest } from "@/lib/requests";
import { lineRow, pmLineCredits, priceLines, PM_LINE_NAME, totals } from "@/lib/estimate-lines";
import { getSetting } from "@/lib/platform-settings";
import { aiCreditStatus } from "@/lib/ai-credits";

/**
 * Phase S demo (S9): ouhers on a contract, as the pricing page's example.
 *   Way 3: Enterprise + PM + creative 20 + 40, 12 months from the 1st of last month, invoiced quarterly, EUR,
 *   contact person Teddy W. Balances this month: PM 14 of 20, creative 31, AI 640 of 1,000.
 *
 * Creative 31 is: 40 this month + 20 carried from September − 15 for Meta Ads − 14 used. Meta Ads (15 a month, a
 * fixed Price List service) replaces the brief's SEO at 30, which is too much for a 40-credit pack; September used
 * little creative (5) so the full 20 carries (the 150% cap). PM: September used all 20 (onboarding), so nothing
 * carries; 6 used this month. Invoices: September (paid) and Q4 (sent), quarterly on calendar quarters.
 * Also: one pending extra creative pack of 10, and one estimate with an estimate item waiting for the PM's number.
 */

const DAY = 86400000;
type Ctx = { clientId: string; now: Date; contactStaffId: string | null; staffUserId: string | null; userId: (packUserId: string) => string; projectId: (packProjectId: string) => string; say: (s: string) => void };

export async function seedPhaseS(ctx: Ctx) {
  const { clientId, now } = ctx;
  if (!ctx.contactStaffId) throw new Error("Phase S demo: Teddy W. (the contact person) is missing");
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const maja = ctx.userId("ou-maja");

  // The old single-balance rows from the contract's start on are replaced by the contract's two ledgers; the AI
  // allowance follows the platform plan (Enterprise, 1,000); the old placeholder invoices give way to real ones.
  await prisma.creditLedgerEntry.deleteMany({ where: { clientId, createdAt: { gte: start } } });
  await prisma.invoice.deleteMany({ where: { clientId, issuedAt: { gte: start } } });
  const enterprise = await prisma.platformPlan.findUniqueOrThrow({ where: { key: "enterprise" } });
  for (const r of await prisma.aiCreditLedger.findMany({ where: { clientId, kind: "ALLOWANCE", createdAt: { gte: new Date(Date.UTC(start.getFullYear(), start.getMonth(), 1)) } } }))
    await prisma.aiCreditLedger.update({ where: { id: r.id }, data: { amount: enterprise.aiCreditsPerMonth, note: `${enterprise.name} plan · ${r.createdAt.toISOString().slice(0, 7)}` } });

  const contract = await createContract({ clientId, platformPlanKey: "enterprise", teamPackKey: "pmc20_40", termMonths: 12, startDate: start, currency: "EUR", invoicing: "quarterly", contactStaffId: ctx.contactStaffId }, ctx.staffUserId);
  await billingProfile(clientId);
  await prisma.billingProfile.update({ where: { clientId }, data: { company: "ouhers AB", orgNumber: "559999-0001 (demo)", country: "SE", vatRate: 0.25, invoiceEmail: "invoices@ouhers.demo", reference: "Maja Lind", address: "Demo street 1, 111 22 Stockholm" } });

  const meta = await prisma.priceListItem.findFirstOrThrow({ where: { deliverableType: "Meta Ads", archivedAt: null } });
  await prisma.serviceAllocation.create({ data: { clientId, priceListItemId: meta.id, name: meta.displayName ?? meta.deliverableType, creditsPerMonth: meta.creditCost ?? 15, startDate: start, months: 12, createdByUserId: ctx.staffUserId } });

  // Approved work, as estimate approval writes it (one row per line, on the line's balance).
  const spend = async (pool: Pool, rows: [string | null, string, number][], from: Date) => {
    for (const [i, [pack, format, credits]] of rows.entries()) {
      const at = new Date(Math.min(now.getTime() - DAY, from.getTime() + (i + 2) * 2 * DAY));
      const before = await poolBalance(clientId, pool);
      await prisma.creditLedgerEntry.create({ data: { clientId, projectId: pack ? ctx.projectId(pack) : null, userId: maja, format, pool, type: "CONSUMPTION", amount: -credits, balanceAfter: before - credits, note: pack ? `${format} · estimate approved` : "Onboarding and contract setup", createdAt: at } });
    }
  };
  await ensureGrants(clientId, new Date(start.getTime() + 14 * DAY)); // September's grant and Meta Ads
  await spend("pm", [[null, PM_LINE_NAME, 12], ["p04-q4-cloudcream", PM_LINE_NAME, 3], ["p05-holiday-giftset", PM_LINE_NAME, 3], ["p06-dewdrop-creators", PM_LINE_NAME, 2]], start);
  await spend("creative", [["p04-q4-cloudcream", "Animated post (static turned into motion)", 4], ["p04-q4-cloudcream", "Iteration (small content/layout tweak)", 1]], start);
  await ensureGrants(clientId, now); // this month: carry, grant, Meta Ads
  await spend("creative", [["p05-holiday-giftset", "Unique social media design (1 post)", 6], ["p06-dewdrop-creators", "Storyboard", 3], ["p05-holiday-giftset", "Copy editing / proofreading (light touch)", 4], ["p07-website-pdp", "Iteration (small content/layout tweak)", 1]], thisMonth);
  await spend("pm", [["p05-holiday-giftset", PM_LINE_NAME, 2], ["p06-dewdrop-creators", PM_LINE_NAME, 1], ["p07-website-pdp", PM_LINE_NAME, 1], ["p11-agent-seasonal", PM_LINE_NAME, 2]], thisMonth);

  // Invoices: September and Q4, written by the schedule; September paid, Q4 sent.
  const made = await generateDueInvoices(now, [clientId]);
  const invoices = await prisma.invoice.findMany({ where: { number: { in: made } }, orderBy: { periodStart: "asc" } });
  for (const inv of invoices) {
    await sendInvoice(inv.id, ctx.staffUserId, new Date(inv.periodStart!.getTime() + DAY));
    if (inv.periodStart! < thisMonth) await markInvoicePaid(inv.id, ctx.staffUserId, new Date(inv.periodStart!.getTime() + 12 * DAY));
  }

  // One pending request: an extra creative pack of 10, a few days ago.
  await createRequest(clientId, maja, "creative_pack", { packs: 1, note: "For the Black Friday emails" }, new Date(now.getTime() - 2 * DAY));

  // One estimate the PM still has to put a number on: retouching is an "estimate" item on the Price List.
  const id = ctx.projectId("p13-giftguide-retouch");
  const created = new Date(now.getTime() - DAY);
  const majaCu = (await prisma.clientUser.findFirst({ where: { clientId, userId: maja } }))?.id ?? null;
  await prisma.project.create({ data: { id, clientId, name: "Gift guide: product retouching", type: "SINGLE_ASSET", status: "ESTIMATING", createdAt: created, startedAt: created, dueDate: new Date(now.getTime() + 21 * DAY), priceCurrency: "EUR", createdByClientUserId: majaCu } });
  await prisma.brief.create({ data: { projectId: id, submittedByUserId: majaCu, goals: "Clean, consistent product shots for the holiday gift guide.", deliverablesNotes: "12 product photos retouched (dust, label edges, colour match to the packshots), plus 4 social posts from the hero shots.", rawIntake: "We shot the gift sets ourselves. Can you retouch 12 photos and make 4 posts for Instagram?" } });
  const ESTIMATE_AT = PIPELINE_STAGE_ORDER.indexOf("ESTIMATE");
  await prisma.pipelineStage.createMany({ data: PIPELINE_STAGE_ORDER.map((name, order) => ({ projectId: id, name, order, status: order < ESTIMATE_AT ? "COMPLETED" : order === ESTIMATE_AT ? "ACTIVE" : "UPCOMING", startedAt: order <= ESTIMATE_AT ? created : null, completedAt: order < ESTIMATE_AT ? created : null })) });
  const items = await prisma.priceListItem.findMany({ where: { deliverableType: { in: ["Image retouching", "Unique social media design (1 post)"] }, archivedAt: null } });
  const item = (n: string) => items.find((i) => i.deliverableType === n)!.id;
  const creative = priceLines(
    [
      { kind: "price", priceListItemId: item("Image retouching"), quantity: 12, detail: "Dust, label edges, colour matched to the packshots" },
      { kind: "price", priceListItemId: item("Unique social media design (1 post)"), quantity: 4, detail: "Instagram posts from the hero shots" },
    ],
    items
  );
  const pm = pmLineCredits(totals(creative).creative, await getSetting("pmLinePercent"), await getSetting("pmLineMin"));
  const lines = [...creative, ...priceLines([{ kind: "pm", credits: pm }], items).map((l) => ({ ...l, order: creative.length }))];
  const t = totals(lines);
  await prisma.estimate.create({ data: { projectId: id, status: "DRAFT", totalCredits: t.total, totalHours: t.total, pmCredits: t.pm, creativeCredits: t.creative, currency: "EUR", createdAt: created, lineItems: { create: lines.map((l) => lineRow(l)) } } });

  const b = await teamBalances(clientId, now);
  const ai = await aiCreditStatus(clientId, now);
  ctx.say(`Phase S · contract ${contract.id} · PM ${b?.pm.left} of ${b?.pm.monthly} · creative ${b?.creative.left} (40 + ${b?.creative.carried} carried − ${b?.creative.services} Meta Ads − ${b?.creative.used} used) · AI ${ai.left} of ${ai.allowance}`);
  ctx.say(`Phase S · ${invoices.length} invoices · 1 pending pack request · 1 estimate waiting for the PM's number`);
  return { pm: b?.pm.left ?? null, creative: b?.creative.left ?? null, ai: ai.left };
}
