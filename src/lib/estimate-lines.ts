import type { PriceListItem } from "@/generated/prisma";
import { jsonArray } from "@/lib/utils";

/**
 * Estimate lines from the 2026 Price List (Phase S step 3). Credits are the value price: quantity × the item's
 * credits, never hours × a multiplier. What each item status means for a line:
 *  - fixed: used as is;
 *  - estimate: the list number is a starting point; the PM must confirm (or change) it before the estimate is sent;
 *  - quote: no number; the PM quotes it before the estimate is sent;
 *  - legacy: never offered (staff reference only).
 * Each line draws on the PM or the creative balance. Every estimate has a PM line (briefing, coordination and feedback
 * rounds), a share of the creative credits with a minimum, which the PM can edit.
 */

export type Balance = "pm" | "creative";
export type LineInput =
  | { kind: "price"; priceListItemId: string; quantity: number; detail: string; credits?: number | null; confirmed?: boolean }
  | { kind: "custom"; deliverable: string; detail: string; quantity: number; credits: number; reason: string; balance: Balance; taskType?: string | null }
  | { kind: "pm"; credits: number; detail?: string };

export type PricedLine = {
  deliverable: string;
  detail: string;
  quantity: number;
  priceListItemId: string | null;
  isCustom: boolean;
  customReason: string | null;
  credits: number;
  hours: number;
  balance: Balance;
  needsConfirm: boolean;
  confirmed: boolean;
  taskType: string | null;
  order: number;
};

export const PM_LINE_NAME = "Marketing PM: briefing, coordination and feedback";
/** Offered to the Estimate agent and in "Add from the price list": live, client-visible, per-project items. */
export const offerable = (i: Pick<PriceListItem, "archivedAt" | "status" | "visibleToClients" | "monthly">) => !i.archivedAt && i.visibleToClients && !i.monthly && i.status !== "legacy";

const half = (n: number) => Math.round(n * 2) / 2;

/** The PM line: pmLinePercent of the creative credits, at least pmLineMin, in half credits. */
export function pmLineCredits(creative: number, pct: number, min: number) {
  return Math.max(min, half(creative * pct));
}

/**
 * Turns editor/agent lines into stored lines. Throws on a line that points at a missing, archived or legacy item.
 * An estimate or quote line keeps needsConfirm; it counts as confirmed only when the PM said so (and, for a quote,
 * gave a number).
 */
export function priceLines(lines: LineInput[], items: Pick<PriceListItem, "id" | "deliverableType" | "displayName" | "creditCost" | "status" | "balance" | "archivedAt" | "visibleToClients" | "monthly">[]): PricedLine[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  return lines.map((l, order) => {
    if (l.kind === "pm") {
      const credits = Math.max(0, half(l.credits));
      return { deliverable: PM_LINE_NAME, detail: l.detail ?? "", quantity: 1, priceListItemId: null, isCustom: false, customReason: null, credits, hours: credits, balance: "pm" as const, needsConfirm: false, confirmed: true, taskType: null, order };
    }
    if (l.kind === "custom") {
      const credits = Math.max(0, l.credits);
      return { deliverable: l.deliverable, detail: l.detail, quantity: l.quantity, priceListItemId: null, isCustom: true, customReason: l.reason, credits, hours: credits, balance: l.balance, needsConfirm: false, confirmed: true, taskType: l.taskType ?? null, order };
    }
    const item = byId.get(l.priceListItemId);
    if (!item || item.archivedAt || item.status === "legacy") throw new Error("That item isn't on the price list any more.");
    const name = item.displayName ?? item.deliverableType;
    const listCredits = item.creditCost != null ? item.creditCost * l.quantity : null;
    if (item.status === "fixed" && listCredits != null) {
      return { deliverable: name, detail: l.detail, quantity: l.quantity, priceListItemId: item.id, isCustom: false, customReason: null, credits: listCredits, hours: listCredits, balance: item.balance as Balance, needsConfirm: false, confirmed: true, taskType: null, order };
    }
    // estimate (or a fixed item without a number) and quote: the PM's number, or the list's as a starting point.
    const credits = l.credits != null ? Math.max(0, l.credits) : (listCredits ?? 0);
    const confirmed = Boolean(l.confirmed) && (item.status !== "quote" || credits > 0);
    return { deliverable: name, detail: l.detail, quantity: l.quantity, priceListItemId: item.id, isCustom: false, customReason: null, credits, hours: credits, balance: item.balance as Balance, needsConfirm: true, confirmed, taskType: null, order };
  });
}

/** The stored row: an estimate/quote line the PM confirmed gets a confirmedAt (and who). */
export function lineRow(l: PricedLine, confirmedBy: string | null = null, at = new Date()) {
  const { confirmed, ...rest } = l;
  return { ...rest, confirmedAt: rest.needsConfirm && confirmed ? at : null, confirmedByStaffId: rest.needsConfirm && confirmed ? confirmedBy : null };
}

export function totals(lines: Pick<PricedLine, "credits" | "balance">[]) {
  const pm = lines.filter((l) => l.balance === "pm").reduce((n, l) => n + l.credits, 0);
  const creative = lines.filter((l) => l.balance !== "pm").reduce((n, l) => n + l.credits, 0);
  return { pm, creative, total: pm + creative };
}

/**
 * Why an estimate can't go to the client yet: estimate/quote lines without the PM's number, and items that matched
 * nothing on the list ("Needs PM quote"). Checked on the server before every send.
 */
export function sendBlockers(estimate: { lineItems: { needsConfirm: boolean; confirmedAt: Date | null }[]; unresolvedNeeds: unknown }) {
  const unconfirmed = estimate.lineItems.filter((l) => l.needsConfirm && !l.confirmedAt).length;
  const open = jsonArray<{ resolution?: unknown }>(estimate.unresolvedNeeds).filter((n) => !n.resolution).length;
  const out: string[] = [];
  if (unconfirmed) out.push(`${unconfirmed} line${unconfirmed === 1 ? " needs" : "s need"} your number`);
  if (open) out.push(`${open} item${open === 1 ? " needs" : "s need"} a PM quote`);
  return out;
}
