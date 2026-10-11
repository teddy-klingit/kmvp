import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { monthPeriod } from "@/lib/ai-credits";
import { redactSecrets } from "@/lib/secrets";

/** One cell, quoted when needed, with any key or token masked (notes are free text). */
const csv = (v: unknown) => {
  const s = v == null ? "" : redactSecrets(String(v));
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Usage → Export CSV: this month's rows from both ledgers (team and AI credits). Account admins only. */
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "CLIENT") return new Response("Not found", { status: 404 });
  const member = await prisma.clientUser.findUnique({ where: { userId: session.user.id } });
  if (!member || member.permission !== "OWNER") return new Response("Not found", { status: 404 });
  const { start, end, key } = monthPeriod();
  const [ai, team, users] = await Promise.all([
    prisma.aiCreditLedger.findMany({ where: { clientId: member.clientId, createdAt: { gte: start, lt: end } }, orderBy: { createdAt: "asc" } }),
    prisma.creditLedgerEntry.findMany({ where: { clientId: member.clientId, createdAt: { gte: start, lt: end } }, include: { project: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({ where: { clientUser: { clientId: member.clientId } }, select: { id: true, name: true } }),
  ]);
  const name = (id: string | null) => (id ? (users.find((u) => u.id === id)?.name ?? "") : "");
  const projects = new Map((await prisma.project.findMany({ where: { id: { in: ai.map((r) => r.projectId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]));
  const lines = [
    ["date", "credits", "kind", "source", "project", "format", "person", "amount", "tokens_in", "tokens_out", "billed_to", "note"].join(","),
    ...team.map((r) => [r.createdAt.toISOString(), "team", r.type.toLowerCase(), "", r.project?.name, r.format, name(r.userId), r.amount, "", "", "", r.note].map(csv).join(",")),
    ...ai.map((r) => [r.createdAt.toISOString(), "ai", r.kind.toLowerCase(), r.sourceName, r.projectId ? projects.get(r.projectId) : "", r.format, name(r.userId), r.amount, r.tokensIn, r.tokensOut, r.billedTo, r.note].map(csv).join(",")),
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="klingit-usage-${key}.csv"`, "Cache-Control": "no-store" } });
}
