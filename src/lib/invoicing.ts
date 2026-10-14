import type { Contract, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/platform-settings";
import { addMonths } from "@/lib/contracts";
import { formatMoney, isCurrency } from "@/lib/pricing";

/**
 * Invoicing (Phase S step 6). Clients pay by invoice, never card. The schedule comes from the contract: monthly,
 * quarterly or upfront (the whole term at the start). Each invoice bills the platform plan, the team pack and extra
 * slots for its period, services sold outside the pack, and everything approved since the last one (extra packs,
 * AI top-ups). Net + VAT (25% in Sweden, reverse charge abroad) = total. Staff send drafts and mark them paid;
 * a sent invoice past its due date is overdue.
 *
 * No accounting integration yet: exportInvoicesCsv() is the hand-off (one row per invoice for a period). An
 * integration (Fortnox, Visma…) would plug in where an invoice is sent (sendInvoice) and paid (markInvoicePaid).
 */

export type InvoiceLine = { kind: string; description: string; quantity: number; unitPrice: number; amount: number };
const DAY = 86400000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/** The contract's invoice periods for its current term. */
export function invoicePeriods(c: Pick<Contract, "startDate" | "endDate" | "termMonths" | "invoicing">) {
  const step = c.invoicing === "upfront" ? c.termMonths : c.invoicing === "monthly" ? 1 : 3;
  const out: { start: Date; end: Date; months: number }[] = [];
  for (let s = c.startDate; s < c.endDate; s = addMonths(s, step)) {
    const e = addMonths(s, step) < c.endDate ? addMonths(s, step) : c.endDate;
    out.push({ start: s, end: e, months: Math.max(1, Math.round((e.getTime() - s.getTime()) / (30.44 * DAY))) });
  }
  return out;
}

export async function billingProfile(clientId: string) {
  const existing = await prisma.billingProfile.findUnique({ where: { clientId } });
  if (existing) return existing;
  const client = await prisma.client.findUniqueOrThrow({ where: { id: clientId }, select: { name: true } });
  return prisma.billingProfile.create({ data: { clientId, company: client.name, vatRate: await getSetting("vatRateDomestic") } });
}

/** VAT for a country: Sweden pays Swedish VAT; elsewhere it's reverse charge (0). Staff can change it per client. */
export async function vatFor(country: string) {
  return country.toUpperCase() === "SE" ? getSetting("vatRateDomestic") : 0;
}

export async function nextInvoiceNumber(year: number) {
  const last = await prisma.invoice.findFirst({ where: { number: { startsWith: `KL-${year}-` } }, orderBy: { number: "desc" }, select: { number: true } });
  const n = last ? Number(last.number.split("-")[2]) + 1 : 1;
  return `KL-${year}-${String(n).padStart(4, "0")}`;
}

/** The lines a contract bills for one period. */
async function contractLines(c: Contract, months: number, pausedForPeriod: boolean): Promise<InvoiceLine[]> {
  const [plan, pack] = await Promise.all([prisma.platformPlan.findUnique({ where: { key: c.platformPlanKey } }), c.teamPackKey ? prisma.teamPack.findUnique({ where: { key: c.teamPackKey } }) : null]);
  const lines: InvoiceLine[] = [{ kind: "platform", description: `${plan?.name ?? c.platformPlanKey} platform plan`, quantity: months, unitPrice: c.platformPrice, amount: r2(months * c.platformPrice) }];
  // A paused contract keeps the platform; the team isn't billed while paused.
  if (c.teamPrice > 0 && !pausedForPeriod) {
    lines.push({ kind: "team", description: `${pack?.name ?? "Team"} (PM ${c.pmCreditsPerMonth} + creative ${c.creativeCreditsPerMonth} credits a month)`, quantity: months, unitPrice: c.teamPrice, amount: r2(months * c.teamPrice) });
    if (c.extraSlots > 0) lines.push({ kind: "extra_slot", description: `Extra active projects (${c.extraSlots}) at 10% of the team price`, quantity: months, unitPrice: r2(c.teamPrice * 0.1 * c.extraSlots), amount: r2(months * c.teamPrice * 0.1 * c.extraSlots) });
  }
  // Services sold outside the pack, at the pack's per-credit rate.
  const services = await prisma.serviceAllocation.findMany({ where: { clientId: c.clientId, outsidePack: true, endedAt: null } });
  const perCredit = pack && pack.priceEur != null && c.pmCreditsPerMonth + c.creativeCreditsPerMonth > 0 ? c.teamPrice / (c.pmCreditsPerMonth + c.creativeCreditsPerMonth) : null;
  for (const s of services) {
    if (perCredit == null) continue;
    lines.push({ kind: "service", description: `${s.name} (${s.creditsPerMonth} credits a month)`, quantity: months, unitPrice: r2(s.creditsPerMonth * perCredit), amount: r2(months * s.creditsPerMonth * perCredit) });
  }
  return lines;
}

/** Writes the draft invoices that are due (a period has started and has no invoice yet), with pending items. */
export async function generateDueInvoices(now = new Date(), clientIds?: string[]) {
  const contracts = await prisma.contract.findMany({ where: { status: { in: ["active", "paused", "ending"] }, ...(clientIds ? { clientId: { in: clientIds } } : {}) } });
  const made: string[] = [];
  for (const c of contracts) {
    const profile = await billingProfile(c.clientId);
    for (const p of invoicePeriods(c)) {
      if (p.start > now) break;
      if (await prisma.invoice.findFirst({ where: { contractId: c.id, periodStart: p.start }, select: { id: true } })) continue;
      const paused = c.status === "paused" && Boolean(c.pausedFrom && c.pausedFrom <= p.start);
      const lines = await contractLines(c, p.months, paused);
      const items = await prisma.billingItem.findMany({ where: { clientId: c.clientId, invoiceId: null, createdAt: { lte: now } } });
      for (const it of items) lines.push({ kind: it.kind, description: it.description, quantity: it.quantity, unitPrice: it.unitPrice, amount: it.amount });
      const net = r2(lines.reduce((n, l) => n + l.amount, 0));
      const vat = r2(net * profile.vatRate);
      const invoice = await prisma.invoice.create({
        data: { clientId: c.clientId, contractId: c.id, number: await nextInvoiceNumber(p.start.getFullYear()), amount: r2(net + vat), currency: c.currency, status: "DRAFT", periodStart: p.start, periodEnd: p.end, netAmount: net, vatRate: profile.vatRate, vatAmount: vat, reference: profile.reference, lineItems: lines as unknown as Prisma.InputJsonValue },
      });
      if (items.length) await prisma.billingItem.updateMany({ where: { id: { in: items.map((i) => i.id) } }, data: { invoiceId: invoice.id } });
      made.push(invoice.number);
    }
  }
  return made;
}

export async function sendInvoice(invoiceId: string, actorUserId: string | null, now = new Date()) {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  if (inv.status !== "DRAFT") return inv;
  const profile = await billingProfile(inv.clientId);
  const sent = await prisma.invoice.update({ where: { id: inv.id }, data: { status: "SENT", issuedAt: now, dueAt: new Date(now.getTime() + profile.paymentTermsDays * DAY) } });
  await prisma.auditLog.create({ data: { clientId: inv.clientId, actorUserId, area: "invoice", action: `sent ${inv.number}`, after: { total: inv.amount, currency: inv.currency } } });
  return sent;
}

export async function markInvoicePaid(invoiceId: string, actorUserId: string | null, now = new Date()) {
  const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  await prisma.invoice.update({ where: { id: inv.id }, data: { status: "PAID", paidAt: now } });
  await prisma.auditLog.create({ data: { clientId: inv.clientId, actorUserId, area: "invoice", action: `paid ${inv.number}` } });
}

/** Sent invoices past their due date become overdue (hourly, and before Billing is shown). */
export async function refreshOverdue(now = new Date()) {
  const r = await prisma.invoice.updateMany({ where: { status: "SENT", dueAt: { lt: now } }, data: { status: "OVERDUE" } });
  return r.count;
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The accounting hand-off: one row per invoice issued in [from, to). */
export async function exportInvoicesCsv(from: Date, to: Date) {
  const rows = await prisma.invoice.findMany({ where: { issuedAt: { gte: from, lt: to } }, include: { client: { select: { name: true, billingProfile: true } } }, orderBy: { number: "asc" } });
  const head = ["number", "client", "company", "org_number", "vat_number", "reference", "issued", "due", "period_start", "period_end", "net", "vat_rate", "vat", "total", "currency", "status", "paid"];
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
  return [
    head.join(","),
    ...rows.map((i) => [i.number, i.client.name, i.client.billingProfile?.company, i.client.billingProfile?.orgNumber, i.client.billingProfile?.vatNumber, i.reference, day(i.issuedAt), day(i.dueAt), day(i.periodStart), day(i.periodEnd), i.netAmount ?? i.amount, i.vatRate ?? 0, i.vatAmount ?? 0, i.amount, i.currency, i.status.toLowerCase(), day(i.paidAt)].map(csvCell).join(",")),
  ].join("\n");
}

export const money = (n: number, currency: string) => (isCurrency(currency) ? formatMoney(n, currency) : `${n} ${currency}`);
