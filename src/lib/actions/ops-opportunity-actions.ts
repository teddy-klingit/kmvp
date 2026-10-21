"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireOpsRole } from "@/lib/authz";
import { kindFor, runOpportunityScan, SOURCES, STATUS_LABEL, type Source } from "@/lib/opportunities";
import { linkInsights } from "@/lib/insight-records";

/**
 * Staff review of Plan → Opportunities (Phase R step 4): before or after a client sees them, an account lead or
 * PM can mark one "Reviewed by Klingit", edit it, hide it, add one by hand or run a scan now (Klingit's cost).
 */

const STAFF = ["ADMIN", "PM"] as const;
const date = (v: FormDataEntryValue | null) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? new Date(`${v}T10:00:00`) : null);

function refresh(clientId: string) {
  revalidatePath(`/ops/clients/${clientId}/opportunities`);
  revalidatePath("/planner", "layout");
  revalidatePath("/opportunities", "layout");
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

/** Phase W: staff override the status (it normally moves on its own), logged. */
export async function setOpportunityStatusAction(formData: FormData) {
  const { viewer, clientId, o } = await own(formData);
  if (!o) return;
  const status = String(formData.get("status") ?? "");
  if (!(status in STATUS_LABEL)) return;
  const before = await prisma.opportunity.findUniqueOrThrow({ where: { id: o.id }, select: { title: true, status: true } });
  if (before.status === status) return;
  await prisma.opportunity.update({ where: { id: o.id }, data: { status, statusSetByUserId: viewer.userId, statusSetAt: new Date(), ...(status === "running" ? { runningAt: new Date() } : {}) } });
  await prisma.auditLog.create({ data: { clientId, actorUserId: viewer.userId, area: "opportunities", action: `Moved “${before.title}” from ${STATUS_LABEL[before.status as keyof typeof STATUS_LABEL] ?? before.status} to ${STATUS_LABEL[status as keyof typeof STATUS_LABEL]}` } });
  refresh(clientId);
}

/** Phase W: "From your Marketing PM": the note on the opportunity (empty removes it), logged. */
export async function savePmNoteAction(formData: FormData) {
  const { viewer, clientId, o } = await own(formData);
  if (!o) return;
  const note = String(formData.get("pmNote") ?? "").trim().slice(0, 600);
  const opp = await prisma.opportunity.update({ where: { id: o.id }, data: note ? { pmNote: note, pmNoteByUserId: viewer.userId, pmNoteAt: new Date() } : { pmNote: null, pmNoteByUserId: null, pmNoteAt: null } });
  await prisma.auditLog.create({ data: { clientId, actorUserId: viewer.userId, area: "opportunities", action: note ? `Wrote a PM note on “${opp.title}”` : `Removed the PM note on “${opp.title}”` } });
  refresh(clientId);
}

/**
 * Phase W: link one of the client's insights to an opportunity (logged). An opportunity needs at least one before the
 * client sees it, so this is how staff bring back an older one that had no evidence.
 */
export async function linkInsightAction(formData: FormData) {
  const { viewer, clientId, o } = await own(formData);
  if (!o) return;
  const insightId = String(formData.get("insightId") ?? "");
  if (!(await linkInsights(clientId, o.id, [insightId]))) return;
  const [opp, insight] = await Promise.all([prisma.opportunity.findUnique({ where: { id: o.id }, select: { title: true } }), prisma.insight.findUnique({ where: { id: insightId }, select: { title: true } })]);
  await prisma.auditLog.create({ data: { clientId, actorUserId: viewer.userId, area: "opportunities", action: `Linked the insight “${insight?.title}” to “${opp?.title}”` } });
  refresh(clientId);
}

/** Add one by hand, built from at least one of the client's insights (Phase W), with one route to start from. */
export async function addOpportunityAction(formData: FormData) {
  const viewer = await requireOpsRole([...STAFF]);
  const clientId = String(formData.get("clientId") ?? "");
  if (!(await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } }))) return;
  const title = String(formData.get("title") ?? "").trim();
  const summary = String(formData.get("summary") ?? "").trim();
  if (!title || !summary) return;
  const source = String(formData.get("source") ?? "trend");
  const start = date(formData.get("windowStart"));
  const insightIds = formData.getAll("insightId").map(String).filter(Boolean);
  if (!(await prisma.insight.count({ where: { clientId, id: { in: insightIds } } }))) return;
  const made = await prisma.opportunity.create({
    data: {
      clientId,
      title,
      summary,
      whyNow: summary.split(". ")[0],
      sources: [(source in SOURCES ? source : "trend") as Source],
      kind: kindFor([source]),
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
  await linkInsights(clientId, made.id, insightIds);
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
