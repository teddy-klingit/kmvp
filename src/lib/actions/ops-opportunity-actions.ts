"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";
import { runOpportunityScan, SOURCES, type Source } from "@/lib/opportunities";

/**
 * Staff review of Plan → Opportunities (Phase R step 4): before or after a client sees them, an account lead or
 * PM can mark one "Reviewed by Klingit", edit it, hide it, add one by hand or run a scan now (Klingit's cost).
 */

const STAFF = ["ADMIN", "PM"] as const;
const date = (v: FormDataEntryValue | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? new Date(`${v}T10:00:00`) : null);

function refresh(clientId: string) {
  revalidatePath(`/ops/clients/${clientId}/opportunities`);
  revalidatePath("/planner", "layout");
  revalidatePath("/dashboard");
}

async function own(formData: FormData) {
  const viewer = await requireOpsRole([...STAFF]);
  const clientId = String(formData.get("clientId") ?? "");
  const id = String(formData.get("id") ?? "");
  const o = id ? await prisma.opportunity.findFirst({ where: { id, clientId }, select: { id: true } }) : null;
  return { viewer, clientId, o };
}

export async function reviewOpportunityAction(formData: FormData) {
  const { viewer, clientId, o } = await own(formData);
  if (!o) return;
  const undo = formData.get("undo") === "1";
  await prisma.opportunity.update({ where: { id: o.id }, data: undo ? { reviewedAt: null, reviewedByUserId: null } : { reviewedAt: new Date(), reviewedByUserId: viewer.userId } });
  refresh(clientId);
}

export async function hideOpportunityAction(formData: FormData) {
  const { clientId, o } = await own(formData);
  if (!o) return;
  await prisma.opportunity.update({ where: { id: o.id }, data: { hiddenAt: formData.get("show") === "1" ? null : new Date() } });
  refresh(clientId);
}

/** Edit what the client reads; saving counts as a review. */
export async function editOpportunityAction(formData: FormData) {
  const { viewer, clientId, o } = await own(formData);
  if (!o) return;
  const title = String(formData.get("title") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  if (!title || !summary) return;
  await prisma.opportunity.update({
    where: { id: o.id },
    data: { title, summary, whyNow: String(formData.get("whyNow") ?? "").trim() || null, windowStart: date(formData.get("windowStart")), windowEnd: date(formData.get("windowEnd")) ?? date(formData.get("windowStart")), reviewedAt: new Date(), reviewedByUserId: viewer.userId },
  });
  refresh(clientId);
}

/** Add one by hand: no evidence (the client sees "Klingit added this one"), one route to start from. */
export async function addOpportunityAction(formData: FormData) {
  const viewer = await requireOpsRole([...STAFF]);
  const clientId = String(formData.get("clientId") ?? "");
  if (!(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) return;
  const title = String(formData.get("title") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  if (!title || !summary) return;
  const source = String(formData.get("source") ?? "trend");
  const start = date(formData.get("windowStart"));
  await prisma.opportunity.create({
    data: {
      clientId,
      title,
      summary,
      whyNow: summary.split(". ")[0],
      sources: [(source in SOURCES ? source : "trend") as Source],
      windowStart: start,
      windowEnd: date(formData.get("windowEnd")) ?? start,
      windowNote: start ? null : "Any time · sooner is better",
      origin: "staff",
      createdByUserId: viewer.userId,
      reviewedAt: new Date(),
      reviewedByUserId: viewer.userId,
      routes: { create: [{ letter: "A", name: String(formData.get("route") ?? "").trim() || "As Klingit suggests", description: summary }] },
    },
  });
  refresh(clientId);
}

export async function runScanNowAction(formData: FormData) {
  const viewer = await requireOpsRole([...STAFF]);
  const clientId = String(formData.get("clientId") ?? "");
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { isDemo: true } });
  if (!client || client.isDemo) return;
  await runOpportunityScan(clientId, { origin: "staff", userId: viewer.userId });
  refresh(clientId);
}
