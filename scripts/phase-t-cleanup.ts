/**
 * Clean-up for prod, run once by Teddy (approved 2026-10-15):
 *   railway ssh -- "bash -c 'cd /app && npx tsx scripts/phase-t-cleanup.ts'"
 * Everything goes through the app's own functions and is logged under Teddy W.; nothing is deleted (archived only),
 * and each step skips what's already done, so running it twice is safe.
 *   1. Life at Spotify gets a Marketing PM (Noor A.).
 *   2. Klarna, Nordlys and Life at Spotify move to their proposed contracts (scheduled until their start dates).
 *   3. Klarna's duplicate "Meta awareness posts" brief and "Add 1 Instagram Reel/week" plan item are merged.
 *   4. The "kskfsdkf" test message and Klarna's never-sent draft projects are archived.
 *   5. Old overdue projects get new due dates (logged on each project).
 *   6. Klarna's old overdue invoice is marked paid.
 *   7. Klingit's own ad accounts are marked internal.
 *   8. Teddy W. is the Marketing PM for ouhers and Nordlys, not Klarna (quick fixes): he comes off Klarna (account
 *      lead and contract contact), his Team tags change, and Klarna waits in Admin → To set up for a new PM.
 * (The first version of this file, committed in 49e7f71, held a read-only check by mistake; this is the clean-up.)
 */
import { prisma } from "@/lib/prisma";
import { applyMigration } from "@/lib/migration";
import { mergeDuplicateBriefs } from "@/lib/duplicate-briefs";
import { markInvoicePaid } from "@/lib/invoicing";
import { listLiveAdAccounts, setLiveAdsInternal } from "@/lib/integrations/live-ads-owner";
import { logDecision } from "@/lib/decision-log";

async function main() {
  const teddy = await prisma.user.findUniqueOrThrow({ where: { email: "teddy@klingit.com" }, select: { id: true } });
  const actor = teddy.id;
  // A client that isn't there (e.g. a local copy) is skipped.
  const client = (name: string) => prisma.client.findFirst({ where: { name, isDemo: false }, select: { id: true, accountLeadId: true } });
  const [klarna, nordlys, spotify] = [await client("Klarna"), await client("Nordlys"), await client("Life at Spotify")];
  if (!klarna) throw new Error("Klarna not found");

  // 1. Life at Spotify gets a Marketing PM.
  const noor = await prisma.staffMember.findFirstOrThrow({ where: { user: { email: "noor@klingit.com" } }, include: { user: true } });
  if (spotify && !spotify.accountLeadId) {
    await prisma.client.update({ where: { id: spotify.id }, data: { accountLeadId: noor.id } });
    await prisma.auditLog.create({ data: { clientId: spotify.id, actorUserId: actor, area: "contract", action: "Marketing PM assigned", before: { accountLeadId: null }, after: { accountLeadId: noor.id, name: noor.user.name } } });
    console.log("PM: Noor A. → Life at Spotify");
  }

  // 2. Migrations, one client at a time (the proposals as sent).
  for (const [name, c] of [["Klarna", klarna], ["Nordlys", nordlys], ["Life at Spotify", spotify]] as const) {
    if (!c) continue;
    if (await prisma.contract.count({ where: { clientId: c.id } })) { console.log("already on a contract:", name); continue; }
    const r = await applyMigration(c.id, { useOverride: true }, actor);
    console.log("MIGRATED", name, r.contract.status, r.contract.platformPlanKey, r.contract.teamPackKey, r.contract.startDate.toISOString().slice(0, 10), r.contract.platformPrice + r.contract.teamPrice, r.contract.currency);
  }

  // 3. Klarna duplicate brief: the 12:37 copy merges into the 12:29 one (archived, logged).
  const meta = await prisma.project.findMany({ where: { clientId: klarna.id, name: "Meta awareness posts", status: { not: "ARCHIVED" } }, orderBy: { createdAt: "asc" } });
  if (meta.length > 1) console.log("MERGED", await mergeDuplicateBriefs(actor, meta[0].id, meta.slice(1).map((m) => m.id)));
  // The duplicate plan item that isn't linked to a project any more (if any) is archived too.
  const reels = await prisma.clientCalendarItem.findMany({ where: { clientId: klarna.id, title: { startsWith: "Add 1 Instagram Reel" }, archivedAt: null }, orderBy: { createdAt: "asc" } });
  for (const r of reels.slice(1)) { await prisma.clientCalendarItem.update({ where: { id: r.id }, data: { archivedAt: new Date() } }); console.log("ARCHIVED plan item copy", r.id); }

  // 4. Test junk: the "kskfsdkf" message, and the draft projects that never went anywhere.
  const junk = spotify ? await prisma.comment.updateMany({ where: { body: "kskfsdkf", project: { clientId: spotify.id }, archivedAt: null }, data: { archivedAt: new Date() } }) : { count: 0 };
  console.log("ARCHIVED junk messages", junk.count);
  const drafts = await prisma.project.findMany({ where: { clientId: klarna.id, status: "DRAFT" } });
  for (const d of drafts) {
    await prisma.project.update({ where: { id: d.id }, data: { status: "ARCHIVED" } });
    await prisma.auditLog.create({ data: { clientId: klarna.id, actorUserId: actor, area: "projects", action: `Archived test draft “${d.name}”`, before: { status: "DRAFT" }, after: { status: "ARCHIVED" } } });
  }
  console.log("ARCHIVED drafts", drafts.map((d) => d.name).join(" | "));

  // 5. Overdue projects: new due dates (logged on each project).
  const now = new Date();
  const overdue = await prisma.project.findMany({ where: { clientId: { in: [klarna.id, ...(spotify ? [spotify.id] : [])] }, status: { notIn: ["ARCHIVED", "DELIVERED", "DRAFT"] }, dueDate: { lt: now } } });
  for (const p of overdue) {
    const days = p.status === "AWAITING_REVIEW" ? 7 : p.status === "IN_PRODUCTION" ? 14 : 21;
    const due = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, 12);
    await prisma.project.update({ where: { id: p.id }, data: { dueDate: due } });
    await logDecision({ projectId: p.id, actorUserId: actor, area: "dates", action: "Changed dates", before: { dueDate: p.dueDate?.toISOString() }, after: { dueDate: due.toISOString() }, reason: "Clean-up of old overdue dates (Phase T)" });
    console.log("MOVED", p.name, "→", due.toISOString().slice(0, 10));
  }

  // 6. The old Klarna invoice is marked paid.
  for (const inv of await prisma.invoice.findMany({ where: { clientId: klarna.id, status: "OVERDUE" } })) { await markInvoicePaid(inv.id, actor); console.log("PAID", inv.number); }

  // 7. Klingit's own ad accounts are internal.
  for (const a of (await listLiveAdAccounts()).filter((x) => x.configured && !x.ownerId && !x.internal)) {
    const r = await setLiveAdsInternal(a.provider, true, actor);
    console.log("INTERNAL", a.platform, a.accountId, r.error ?? "ok");
  }
}
// 8. Teddy W.: ouhers and Nordlys, not Klarna. Klarna gets no PM here; an admin assigns one (Noor A. is suggested).
async function teddyOffKlarna(actor: string, klarnaId: string) {
  const teddy = await prisma.staffMember.findFirstOrThrow({ where: { userId: actor }, include: { user: true } });
  const k = await prisma.client.findUniqueOrThrow({ where: { id: klarnaId }, select: { accountLeadId: true } });
  if (k.accountLeadId === teddy.id) {
    await prisma.client.update({ where: { id: klarnaId }, data: { accountLeadId: null } });
    await prisma.auditLog.create({ data: { clientId: klarnaId, actorUserId: actor, area: "contract", action: "Marketing PM removed: Teddy W. is no longer Klarna's account lead", before: { accountLeadId: teddy.id, name: teddy.user.name }, after: { accountLeadId: null } } });
    console.log("KLARNA account lead: Teddy W. → none");
  }
  for (const c of await prisma.contract.findMany({ where: { clientId: klarnaId, contactStaffId: teddy.id } })) {
    await prisma.contract.update({ where: { id: c.id }, data: { contactStaffId: null } });
    await prisma.contractChange.create({ data: { contractId: c.id, kind: "contact", effectiveFrom: new Date(), before: { contactStaffId: teddy.id }, after: { contactStaffId: null }, byUserId: actor } });
    await prisma.auditLog.create({ data: { clientId: klarnaId, actorUserId: actor, area: "contract", action: "contact person changed", before: { contactStaffId: teddy.id, name: teddy.user.name }, after: { contactStaffId: null, name: null } } });
    console.log("KLARNA contract contact: Teddy W. → none", c.status);
  }
  const tags = ["ouhers", "beauty", "Nordlys", "retail & fashion"];
  if (JSON.stringify(teddy.brandFitTags) !== JSON.stringify(tags)) {
    await prisma.staffMember.update({ where: { id: teddy.id }, data: { brandFitTags: tags } });
    await prisma.auditLog.create({ data: { actorUserId: actor, area: "roles", action: "Teddy W.'s client tags changed", before: { brandFitTags: teddy.brandFitTags ?? null }, after: { brandFitTags: tags } } });
    console.log("TAGS", tags.join(", "));
  }
}

main().then(async () => {
  const teddy = await prisma.user.findUniqueOrThrow({ where: { email: "teddy@klingit.com" }, select: { id: true } });
  const klarna = await prisma.client.findFirstOrThrow({ where: { name: "Klarna", isDemo: false }, select: { id: true } });
  await teddyOffKlarna(teddy.id, klarna.id);
}).catch((e) => { console.error("FAILED", e); process.exitCode = 1; }).finally(() => prisma.$disconnect());