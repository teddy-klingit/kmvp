import type { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { notifyMany } from "@/lib/notifier";
import { aiTopUpPrice, creativePackPrice, isCurrency, loadPricing, monthlyPrice, type Currency } from "@/lib/pricing";
import { ContractError, liveContract, pauseContract, scheduleDowngrade, scheduleUpgrade } from "@/lib/contracts";
import { poolBalance } from "@/lib/team-ledger";

/**
 * Client purchases and changes are requests (Phase S step 6): the client sees the price and the rule in one line,
 * staff approve in /ops → Requests, the change applies and anything one-off goes on the next invoice (BillingItem).
 * AI top-ups can be auto-approved up to a per-client price. Every decision is in the AuditLog.
 */

export const REQUEST_KINDS = {
  creative_pack: { label: "Extra creative credits", rule: "Packs of 10 creative credits, added when Klingit approves, on your next invoice." },
  ai_topup: { label: "AI credit top-up", rule: "Added when approved, on your next invoice. Top-ups don't expire." },
  extra_slot: { label: "Extra active project", rule: "One more project at once, 10% of your monthly team price, from your next invoice." },
  plan_change: { label: "Change plan or pack", rule: "Upgrades start 7 days after approval and last at least 3 months; downgrades once a month, with a month's notice." },
  pause: { label: "Pause", rule: "Klingit decides case by case. You keep the platform; new projects stop and your end date moves by the pause." },
  per_request: { label: "Per request", rule: "Tell us what you need; your Marketing PM comes back with credits and a price." },
} as const;
export type RequestKind = keyof typeof REQUEST_KINDS;
export const isRequestKind = (k: unknown): k is RequestKind => typeof k === "string" && k in REQUEST_KINDS;

export class RequestError extends Error {}

/** The price the client sees before sending, in their contract's currency. */
export async function quoteRequest(clientId: string, kind: RequestKind, payload: Record<string, unknown>) {
  const contract = await liveContract(clientId);
  const currency: Currency = contract && isCurrency(contract.currency) ? contract.currency : "EUR";
  const p = await loadPricing();
  switch (kind) {
    case "creative_pack": {
      const packs = Math.max(1, Math.round(Number(payload.packs ?? 1)));
      const one = creativePackPrice(p, contract?.teamPackKey, currency);
      return { price: one.price * packs, currency, credits: one.credits * packs, per: "once" as const };
    }
    case "ai_topup": {
      const n = Math.max(1, Math.round(Number(payload.count ?? 1)));
      const one = aiTopUpPrice(p, currency);
      return { price: one.price * n, currency, credits: one.credits * n, per: "once" as const };
    }
    case "extra_slot":
      if (!contract?.teamPrice) throw new RequestError("Extra projects come with a team pack.");
      return { price: Math.round(contract.teamPrice * 0.1), currency, credits: 0, per: "month" as const };
    case "plan_change": {
      if (!contract) throw new RequestError("You need a contract first: talk to your Marketing PM.");
      const term = Number(payload.months ?? contract.termMonths);
      const m = monthlyPrice(p, { planKey: String(payload.platformPlanKey ?? contract.platformPlanKey), packKey: (payload.teamPackKey as string | null) ?? null, term, currency });
      return { price: m.total, currency, credits: 0, per: "month" as const };
    }
    default:
      return { price: null, currency, credits: 0, per: "once" as const };
  }
}

export async function createRequest(clientId: string, userId: string | null, kind: RequestKind, payload: Record<string, unknown>, now = new Date()) {
  const q = await quoteRequest(clientId, kind, payload);
  const req = await prisma.purchaseRequest.create({ data: { clientId, kind, payload: { ...payload, credits: q.credits, per: q.per } as Prisma.InputJsonValue, price: q.price, currency: q.currency, requestedByUserId: userId, createdAt: now } });
  await prisma.auditLog.create({ data: { clientId, actorUserId: userId, area: "request", action: `requested ${REQUEST_KINDS[kind].label}`, after: { price: q.price, currency: q.currency, payload } as Prisma.InputJsonValue } });
  // AI top-ups under the client's auto-approve price don't wait for staff.
  if (kind === "ai_topup" && q.price != null) {
    const profile = await prisma.billingProfile.findUnique({ where: { clientId }, select: { aiTopUpAutoApproveUpTo: true } });
    if (profile?.aiTopUpAutoApproveUpTo != null && q.price <= profile.aiTopUpAutoApproveUpTo) return decideRequest(req.id, null, true, "Auto-approved (under the client's limit)", now);
  }
  const lead = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true, accountLead: { select: { userId: true } } } });
  if (lead?.accountLead) await notifyMany([{ userId: lead.accountLead.userId, clientId, type: "APPROVAL_NEEDED" as const, title: `${lead.name}: ${REQUEST_KINDS[kind].label.toLowerCase()} to approve`, body: q.price != null ? `${q.price} ${q.currency}${q.per === "month" ? " a month" : ""}` : "Needs a price", actionUrl: "/ops/requests", actionLabel: "Open requests" }]);
  return req;
}

/**
 * Approve or decline. Approving applies the change: creative credits land in the creative balance, an AI top-up in
 * the AI ledger, an extra slot on the contract, a plan change is scheduled, a pause starts; one-off prices become a
 * BillingItem for the next invoice. Declined requests change nothing.
 */
export async function decideRequest(requestId: string, staffUserId: string | null, approve: boolean, note: string | null, now = new Date()) {
  const req = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: requestId } });
  if (req.status !== "pending") throw new RequestError("Already decided.");
  const payload = req.payload as Record<string, unknown>;
  if (approve) {
    const contract = await liveContract(req.clientId);
    const bill = (description: string, quantity: number, unitPrice: number) => prisma.billingItem.create({ data: { clientId: req.clientId, kind: req.kind, description, quantity, unitPrice, amount: Math.round(quantity * unitPrice * 100) / 100, currency: req.currency, requestId: req.id } });
    switch (req.kind as RequestKind) {
      case "creative_pack": {
        const credits = Number(payload.credits ?? 10);
        const before = await poolBalance(req.clientId, "creative");
        await prisma.creditLedgerEntry.create({ data: { clientId: req.clientId, pool: "creative", type: "PURCHASE", amount: credits, balanceAfter: before + credits, note: `Extra creative credits: ${credits}`, userId: req.requestedByUserId, createdAt: now } });
        if (req.price != null) await bill(`Extra creative credits (${credits})`, 1, req.price);
        break;
      }
      case "ai_topup": {
        const credits = Number(payload.credits ?? 0);
        await prisma.aiCreditLedger.create({ data: { clientId: req.clientId, kind: "BUNDLE", amount: credits, note: `Top-up · ${credits} AI credits`, createdById: staffUserId, createdAt: now } });
        if (req.price != null) await bill(`AI credit top-up (${credits})`, 1, req.price);
        break;
      }
      case "extra_slot":
        if (!contract) throw new RequestError("No contract to add a slot to.");
        await prisma.contract.update({ where: { id: contract.id }, data: { extraSlots: contract.extraSlots + 1 } });
        break;
      case "plan_change": {
        if (!contract) throw new RequestError("No contract to change.");
        const pack = (payload.teamPackKey as string | null) ?? null;
        const nextCredits = pack ? await prisma.teamPack.findUnique({ where: { key: pack } }).then((x) => (x ? x.pmCredits + x.creativeCredits : 0)) : 0;
        try {
          if (nextCredits > contract.pmCreditsPerMonth + contract.creativeCreditsPerMonth && pack) await scheduleUpgrade(contract.id, { teamPackKey: pack, platformPlanKey: String(payload.platformPlanKey ?? contract.platformPlanKey), months: Number(payload.months ?? 3) }, staffUserId, now);
          else await scheduleDowngrade(contract.id, { teamPackKey: pack }, staffUserId, now);
        } catch (e) {
          if (e instanceof ContractError) throw new RequestError(e.message);
          throw e;
        }
        break;
      }
      case "pause":
        if (!contract) throw new RequestError("No contract to pause.");
        await pauseContract(contract.id, staffUserId, String(payload.note ?? "Asked by the client"), now);
        break;
      default:
        break;
    }
  }
  const decided = await prisma.purchaseRequest.update({ where: { id: req.id }, data: { status: approve ? "approved" : "declined", decidedByUserId: staffUserId, decidedAt: now, decisionNote: note } });
  await prisma.auditLog.create({ data: { clientId: req.clientId, actorUserId: staffUserId, area: "request", action: `${approve ? "approved" : "declined"} ${REQUEST_KINDS[req.kind as RequestKind]?.label ?? req.kind}`, after: { price: req.price, note } as Prisma.InputJsonValue } });
  if (req.requestedByUserId) await notifyMany([{ userId: req.requestedByUserId, clientId: req.clientId, type: "SYSTEM" as const, title: `${REQUEST_KINDS[req.kind as RequestKind]?.label ?? "Request"} ${approve ? "approved" : "declined"}`, body: note ?? (approve ? "It's on your account; the line comes on your next invoice." : "Your Marketing PM can tell you more."), actionUrl: "/settings/plan", actionLabel: "See your plan" }]);
  return decided;
}
