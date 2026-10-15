import { prisma } from "@/lib/prisma";
import { jsonArray } from "@/lib/utils";
import { computeStaffingSuggestions } from "@/lib/staffing";
import { loadStaffPool } from "@/lib/autopilot-runner";
import { teamBalances } from "@/lib/team-ledger";
import { nudgeDraft } from "@/lib/plan-nudge";
import { getSetting } from "@/lib/platform-settings";
import { PM_LINE_NAME } from "@/lib/estimate-lines";
import type { Task } from "@/lib/today";

/**
 * What each Today row needs to act in place (Phase T): the estimate's lines for the inline editor, the top two
 * creators for staffing, the drafted nudge, the request's price and new balance, the creator to ask.
 */

export type EstimateRowStatus = "Price List" | "Check" | "Quote" | "Merged" | "PM credits";
export type EstimateRow = {
  key: string;
  need: string;
  match: string;
  status: EstimateRowStatus;
  credits: number | null;
  editable: boolean;
  balance: "pm" | "creative";
  /** How to send it back to saveEstimate. */
  input: { kind: "price"; priceListItemId: string; quantity: number; detail: string } | { kind: "custom"; deliverable: string; detail: string; quantity: number; reason: string; balance: "pm" | "creative"; taskType: string | null } | { kind: "pm"; detail: string } | { kind: "need"; index: number };
};
export type InlineData =
  | { kind: "ESTIMATE"; projectId: string; clientName: string; rows: EstimateRow[]; creativeLeft: number | null; pmPercent: number; pmMin: number; splitNote: string }
  | { kind: "MESSAGE"; projectId: string; creator: { name: string; userId: string } | null }
  | { kind: "PLAN"; itemId: string; draft: string }
  | { kind: "REQUEST"; requestId: string; price: string | null; balance: { before: number; after: number } | null }
  | { kind: "STAFFING"; projectId: string; role: string; candidates: { staffMemberId: string; name: string; score: number; note: string }[] }
  | { kind: "DEADLINE"; projectId: string; creator: { name: string; userId: string } | null; dueDate: string | null };

const CREATOR_TITLES = ["ART_DIRECTOR", "COPYWRITER", "MOTION_DESIGNER"];
const ROLE_TITLE: Record<string, string> = { "art director": "ART_DIRECTOR", copywriter: "COPYWRITER", "motion designer": "MOTION_DESIGNER" };

async function creatorOn(projectId: string) {
  const team = await prisma.team.findUnique({ where: { projectId }, include: { members: { include: { staffMember: { include: { user: { select: { id: true, name: true } } } } } } } });
  const m = team?.members.find((x) => CREATOR_TITLES.includes(x.staffMember.title));
  return m ? { name: m.staffMember.user.name, userId: m.staffMember.user.id } : null;
}

export async function loadInline(tasks: Task[]): Promise<Record<string, InlineData>> {
  const out: Record<string, InlineData> = {};
  const [pmPercent, pmMin] = await Promise.all([getSetting("pmLinePercent"), getSetting("pmLineMin")]);
  let pool: Awaited<ReturnType<typeof loadStaffPool>> | null = null;
  for (const t of tasks) {
    if (t.kind === "ESTIMATE" && t.projectId && t.ref.estimateId) {
      const est = await prisma.estimate.findUnique({ where: { id: t.ref.estimateId }, include: { lineItems: { include: { priceListItem: true }, orderBy: { order: "asc" } } } });
      if (!est) continue;
      const rows: EstimateRow[] = est.lineItems.map((l) => {
        if (l.deliverable === PM_LINE_NAME && l.balance === "pm" && !l.priceListItemId && !l.isCustom) return { key: l.id, need: "Your time: briefing, feedback rounds", match: `PM line, ${Math.round(pmPercent * 100)}% of creative`, status: "PM credits", credits: l.credits, editable: true, balance: "pm", input: { kind: "pm", detail: l.detail } };
        if (l.priceListItemId && l.priceListItem) {
          const name = l.priceListItem.displayName ?? l.priceListItem.deliverableType;
          return { key: l.id, need: l.detail || name, match: l.quantity > 1 ? `${name} × ${l.quantity}` : name, status: l.credits === 0 ? "Merged" : l.needsConfirm ? "Check" : "Price List", credits: l.needsConfirm && !l.confirmedAt ? l.credits || null : l.credits, editable: l.needsConfirm, balance: l.balance === "pm" ? "pm" : "creative", input: { kind: "price", priceListItemId: l.priceListItemId, quantity: l.quantity, detail: l.detail } };
        }
        return { key: l.id, need: l.detail || l.deliverable, match: l.deliverable, status: l.needsConfirm && !l.confirmedAt ? "Quote" : "Price List", credits: l.credits, editable: true, balance: l.balance === "pm" ? "pm" : "creative", input: { kind: "custom", deliverable: l.deliverable, detail: l.detail, quantity: l.quantity, reason: l.customReason ?? "PM quote", balance: l.balance === "pm" ? "pm" : "creative", taskType: l.taskType } };
      });
      // Items the brief asked for that aren't on the Price List: the PM quotes them here.
      jsonArray<{ description: string; resolution?: unknown }>(est.unresolvedNeeds).forEach((n, index) => {
        if (!n.resolution) rows.splice(rows.findIndex((r) => r.status === "PM credits") >= 0 ? rows.findIndex((r) => r.status === "PM credits") : rows.length, 0, { key: `need-${index}`, need: n.description, match: "Not on the Price List", status: "Quote", credits: null, editable: true, balance: "creative", input: { kind: "need", index } });
      });
      const b = await teamBalances(t.clientId);
      const matched = est.lineItems.filter((l) => l.priceListItemId).length;
      out[t.key] = { kind: "ESTIMATE", projectId: t.projectId, clientName: t.clientName, rows, creativeLeft: b ? b.creative.left : null, pmPercent, pmMin, splitNote: `The brief agent split it into ${rows.filter((r) => r.status !== "PM credits").length} lines and matched ${matched} to the Price List` };
    } else if (t.kind === "MESSAGE" && t.projectId) {
      out[t.key] = { kind: "MESSAGE", projectId: t.projectId, creator: await creatorOn(t.projectId) };
    } else if (t.kind === "PLAN" && t.ref.planItemId) {
      const item = await prisma.clientCalendarItem.findUnique({ where: { id: t.ref.planItemId } });
      if (item) out[t.key] = { kind: "PLAN", itemId: item.id, draft: nudgeDraft(item) };
    } else if (t.kind === "REQUEST" && t.ref.requestId) {
      const r = await prisma.purchaseRequest.findUnique({ where: { id: t.ref.requestId } });
      if (!r) continue;
      const credits = r.kind === "creative_pack" ? (((r.payload ?? {}) as { packs?: number }).packs ?? 1) * 10 : 0;
      const b = credits ? await teamBalances(r.clientId) : null;
      out[t.key] = { kind: "REQUEST", requestId: r.id, price: r.price != null ? `${r.price.toLocaleString("en-GB")} ${r.currency}` : null, balance: b ? { before: Math.round(b.creative.left), after: Math.round(b.creative.left + credits) } : null };
    } else if (t.kind === "STAFFING" && t.projectId) {
      const project = await prisma.project.findUnique({ where: { id: t.projectId }, select: { type: true, clientId: true } });
      if (!project) continue;
      pool ??= await loadStaffPool();
      const role = /art director|copywriter|motion designer/i.exec(t.sentence)?.[0]?.toLowerCase() ?? "";
      const title = ROLE_TITLE[role];
      const candidates = computeStaffingSuggestions(pool, { projectType: project.type, clientId: project.clientId })
        .filter((s) => !title || s.title === title)
        .slice(0, 2)
        .map((s) => ({ staffMemberId: s.staffMemberId, name: s.name, score: s.overallScore, note: s.utilizationPct >= 90 ? `${s.utilizationPct}% booked` : s.workedWithClientBefore ? "worked with them before" : `${s.availableHours}h free this week` }));
      out[t.key] = { kind: "STAFFING", projectId: t.projectId, role: role || "creator", candidates };
    } else if (t.kind === "DEADLINE" && t.projectId) {
      const p = await prisma.project.findUnique({ where: { id: t.projectId }, select: { dueDate: true } });
      out[t.key] = { kind: "DEADLINE", projectId: t.projectId, creator: await creatorOn(t.projectId), dueDate: p?.dueDate ? p.dueDate.toISOString().slice(0, 10) : null };
    }
  }
  return out;
}
