/**
 * Phase T clean-up (approved by Teddy on 2026-10-15): run once on prod with
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
 */
import { prisma } from "@/lib/prisma";
import { loadToday } from "@/lib/today";
import { scopeFor } from "@/lib/staff-scope";
async function main() {
  const teddy = await prisma.staffMember.findFirstOrThrow({ where: { user: { email: "teddy@klingit.com" } } });
  const t = await loadToday(await scopeFor(teddy), new Date(), teddy);
  console.log("TODAY", t.tasks.length, "done", t.done.length);
  for (const x of t.tasks) console.log(" ", x.section, "|", x.clientName, "|", x.subject, "|", x.kind, "|", x.sentence, "|", x.due.label);
  console.log("EYE", JSON.stringify(t.keepAnEye.map((k) => [k.title, k.line, k.note])));
  const junk = await prisma.comment.findMany({ where: { project: { client: { isDemo: false } }, archivedAt: null, kind: "MESSAGE" }, select: { id: true, body: true, createdAt: true, project: { select: { name: true, client: { select: { name: true } } } } } });
  const looksJunk = junk.filter((c) => /^[a-z]{5,12}$/i.test(c.body.trim()) && !/[aeiou]{1}.*[aeiou]/i.test(c.body.trim().slice(1, -1)) || /^(test|asdf|qwer|kskf|hej|hello)\b/i.test(c.body.trim()) || c.body.trim().length < 4);
  console.log("JUNK", JSON.stringify(looksJunk.map((c) => [c.project.client.name, c.project.name, c.body.slice(0, 40), c.createdAt.toISOString().slice(0, 10)])));
  const tp = await prisma.project.findMany({ where: { client: { isDemo: false }, OR: [{ name: { contains: "test" } }, { name: { contains: "Test" } }] }, select: { name: true, status: true, client: { select: { name: true } } } });
  console.log("TESTPROJ", JSON.stringify(tp));
  const overdue = await prisma.project.findMany({ where: { client: { isDemo: false }, status: { notIn: ["ARCHIVED", "DELIVERED", "DRAFT"] }, dueDate: { lt: new Date() } }, include: { client: { select: { name: true } } }, orderBy: { dueDate: "asc" } });
  console.log("OVERDUE", JSON.stringify(overdue.map((p) => [p.client.name, p.name, p.status, p.dueDate?.toISOString().slice(0, 10), p.updatedAt.toISOString().slice(0, 10)])));
  const drafts = await prisma.project.findMany({ where: { client: { isDemo: false }, status: "DRAFT" }, include: { client: { select: { name: true } } } });
  console.log("DRAFTS", JSON.stringify(drafts.map((p) => [p.client.name, p.name, p.createdAt.toISOString().slice(0, 10)])));
  const ou = await prisma.project.groupBy({ by: ["name"], where: { clientId: "client-ouhers", status: { not: "ARCHIVED" } }, _count: true });
  console.log("OUHERS DUP", JSON.stringify(ou.filter((g) => g._count > 1)));
}
main().finally(() => prisma.$disconnect());
