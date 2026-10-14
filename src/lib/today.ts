import { prisma } from "@/lib/prisma";
import { loadOpsProjects, rankExceptions } from "@/lib/ops-exceptions";
import { teamBalances } from "@/lib/team-ledger";
import { REQUEST_KINDS, type RequestKind } from "@/lib/requests";
import type { Scope } from "@/lib/staff-scope";

/**
 * Today, the PM's home (Phase S, S7.1): one list across their clients (or all), sorted by urgency, one main action
 * each. On top of the project exceptions (client waiting, failed agent, staffing, quality check, estimate to send,
 * repeat change request, deadline at risk): estimates waiting for the PM's number, plan items that need Klingit's
 * help close to (or past) their brief-by date, new briefs, client requests to approve, low balances (under 20% left)
 * and contracts within 30 days of their notice deadline.
 */

const DAY = 86400000;
export type TodayItem = { id: string; kind: string; kindLabel: string; short: string; tone: "danger" | "turn" | "neutral"; rank: number; title: string; detail: string; clientId: string; clientName: string; since: Date; action: { label: string; href: string } };

const ago = (since: Date, now: Date) => {
  const h = Math.max(0, Math.round((now.getTime() - since.getTime()) / 3600000));
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`;
};

export async function loadToday(scope: Scope, now = new Date()) {
  const inScope = scope.clientIds ? { clientId: { in: scope.clientIds } } : {};
  const [projects, estimates, quotes, planItems, briefs, requests, contracts] = await Promise.all([
    loadOpsProjects(inScope, now),
    prisma.estimate.findMany({ where: { status: "DRAFT", project: { status: { notIn: ["ARCHIVED", "DRAFT"] }, ...inScope }, lineItems: { some: { needsConfirm: true, confirmedAt: null } } }, include: { project: { select: { id: true, name: true, clientId: true, client: { select: { name: true } } } }, lineItems: { where: { needsConfirm: true, confirmedAt: null }, select: { id: true } } } }),
    prisma.estimate.findMany({ where: { status: "DRAFT", project: { status: { notIn: ["ARCHIVED", "DRAFT"] }, ...inScope } }, include: { project: { select: { id: true, name: true, clientId: true, client: { select: { name: true } } } } } }),
    prisma.clientCalendarItem.findMany({ where: { ...inScope, maker: "klingit_help", projectId: null, archivedAt: null, briefBy: { not: null, lte: new Date(now.getTime() + 7 * DAY) }, date: { gte: new Date(now.getTime() - 2 * DAY) } }, include: { client: { select: { name: true } } } }),
    prisma.project.findMany({ where: { ...inScope, status: "BRIEFING", createdAt: { gte: new Date(now.getTime() - 3 * DAY) } }, select: { id: true, name: true, clientId: true, createdAt: true, client: { select: { name: true } } } }),
    prisma.purchaseRequest.findMany({ where: { ...inScope, status: "pending" }, include: { client: { select: { name: true } } } }),
    prisma.contract.findMany({ where: { ...inScope, status: { in: ["active", "paused"] } }, include: { client: { select: { name: true } } } }),
  ]);
  const needsNumber = new Set(estimates.map((e) => e.project.id));
  const items: TodayItem[] = rankExceptions(projects)
    // Shown below as "needs your number", with the estimate lines (one item per estimate, not two).
    .filter((e) => e.kind !== "out_of_scope" && !(e.kind === "estimate_send" && needsNumber.has(e.projectId)))
    .map((e) => {
      const p = projects.find((x) => x.project.id === e.projectId);
      return { id: e.id, kind: e.kind, kindLabel: e.kindLabel, short: e.kindShort, tone: e.tone, rank: e.rank, title: e.title, detail: `${e.detail} · ${e.projectName}`, clientId: p?.project.clientId ?? "", clientName: e.clientName, since: e.since, action: e.action };
    });
  for (const est of estimates)
    items.push({ id: `est-${est.id}`, kind: "estimate_number", kindLabel: "Needs your number", short: "EST", tone: "turn", rank: 1, title: `${est.lineItems.length} estimate line${est.lineItems.length === 1 ? " needs" : "s need"} your number`, detail: `${est.project.name}: estimate or quote items from the Price List`, clientId: est.project.clientId, clientName: est.project.client.name, since: est.createdAt, action: { label: "Price it", href: `/ops/projects/${est.project.id}?edit=estimate#estimate` } });
  for (const est of quotes)
    for (const n of (est.unresolvedNeeds as { description: string; resolution?: unknown }[] | null) ?? [])
      if (!n.resolution)
        items.push({ id: `quote-${est.id}-${n.description}`, kind: "pm_quote", kindLabel: "Needs PM quote", short: "QUOTE", tone: "turn", rank: 1, title: `Quote: ${n.description}`, detail: `${est.project.name}: not on the Price List`, clientId: est.project.clientId, clientName: est.project.client.name, since: est.createdAt, action: { label: "Quote it", href: `/ops/projects/${est.project.id}?edit=estimate#estimate` } });
  for (const i of planItems) {
    const late = i.briefBy! < now;
    items.push({ id: `plan-${i.id}`, kind: "plan_brief", kindLabel: late ? "Brief-by passed" : "Brief due soon", short: "PLAN", tone: late ? "danger" : "turn", rank: late ? 0 : 2, title: i.title, detail: `Klingit's help needed · brief by ${new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(i.briefBy!)}`, clientId: i.clientId, clientName: i.client.name, since: i.briefBy!, action: { label: late ? "Talk to the client" : "Nudge the client", href: `/ops/plan?item=${i.id}` } });
  }
  for (const b of briefs) items.push({ id: `brief-${b.id}`, kind: "new_brief", kindLabel: "New brief", short: "NEW", tone: "turn", rank: 2, title: b.name, detail: "A new brief came in", clientId: b.clientId, clientName: b.client.name, since: b.createdAt, action: { label: "Open brief", href: `/ops/projects/${b.id}#brief` } });
  for (const r of requests) items.push({ id: `req-${r.id}`, kind: "request", kindLabel: "Request", short: "REQ", tone: "turn", rank: 1, title: REQUEST_KINDS[r.kind as RequestKind]?.label ?? r.kind, detail: r.price != null ? `${r.price.toLocaleString("en-GB")} ${r.currency}` : "Needs a price", clientId: r.clientId, clientName: r.client.name, since: r.createdAt, action: { label: "Review", href: "/ops/requests" } });
  for (const c of contracts) {
    const days = Math.ceil((c.noticeDeadline.getTime() - now.getTime()) / DAY);
    if (c.autoRenew && days >= 0 && days <= 30) items.push({ id: `notice-${c.id}`, kind: "notice", kindLabel: "Notice deadline", short: "RENEW", tone: "turn", rank: 3, title: `Renews unless cancelled in ${days} days`, detail: `Notice deadline ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(c.noticeDeadline)} · ${c.termMonths}-month term`, clientId: c.clientId, clientName: c.client.name, since: c.noticeDeadline, action: { label: "Open contract", href: `/ops/clients/${c.clientId}/contract` } });
    const b = await teamBalances(c.clientId, now);
    for (const pool of ["pm", "creative"] as const) {
      const p = b?.[pool];
      if (p && p.monthly > 0 && p.left < p.monthly * 0.2) items.push({ id: `low-${c.id}-${pool}`, kind: "low_balance", kindLabel: "Low balance", short: "LOW", tone: "neutral", rank: 4, title: `${pool === "pm" ? "PM" : "Creative"} credits low: ${Math.round(p.left)} of ${p.monthly} left`, detail: "Under 20% of the month: talk about an extra pack or the plan", clientId: c.clientId, clientName: c.client.name, since: now, action: { label: "Open balances", href: `/ops/clients/${c.clientId}/balances` } });
    }
  }
  items.sort((a, b) => a.rank - b.rank || a.since.getTime() - b.since.getTime());
  return { items: items.map((i) => ({ ...i, waiting: ago(i.since, now) })), projects };
}
