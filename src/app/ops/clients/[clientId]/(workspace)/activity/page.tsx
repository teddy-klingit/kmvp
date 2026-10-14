import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardRows, CardNote } from "@/components/ds/card";

const when = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);

/**
 * Client workspace → Activity (Phase S, S7.3): one timeline of the client's AuditLog (contract, balances, billing,
 * requests, rules, keys…), the projects' decisions (PM changes, autopilot) and their agent runs.
 */
export default async function ClientActivityPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) notFound();
  const [audit, decisions, runs] = await Promise.all([
    prisma.auditLog.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.decisionLog.findMany({ where: { project: { clientId } }, include: { project: { select: { id: true, name: true } }, actor: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 60 }),
    prisma.agentRun.findMany({ where: { project: { clientId } }, include: { agent: { select: { name: true } }, project: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 40 }),
  ]);
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: audit.flatMap((a) => (a.actorUserId ? [a.actorUserId] : [])) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const rows = [
    ...audit.map((a) => ({ id: `a-${a.id}`, at: a.createdAt, who: a.actorUserId ? (actors.get(a.actorUserId) ?? "Someone") : "System", what: a.action, where: a.area, href: null as string | null })),
    ...decisions.map((d) => ({ id: `d-${d.id}`, at: d.createdAt, who: d.actor?.name ?? "Autopilot", what: d.action, where: d.project.name, href: `/ops/projects/${d.project.id}` })),
    ...runs.map((r) => ({ id: `r-${r.id}`, at: r.createdAt, who: r.agent.name, what: r.decision ?? r.status.toLowerCase(), where: r.project?.name ?? "", href: r.project ? `/ops/projects/${r.project.id}` : null })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  return (
    <SectionCard title="Activity" meta={<span className="text-[12px] text-brand-ink-2">Audit log, decisions and agent runs</span>}>
      {rows.length === 0 ? (
        <CardNote>Nothing yet.</CardNote>
      ) : (
        <CardRows>
          {rows.slice(0, 120).map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5 px-6 py-2.5 text-[13px]">
              <span className="w-28 text-brand-ink-2">{when(r.at)}</span>
              <span className="w-36 truncate">{r.who}</span>
              <span className="min-w-[200px] flex-1">{r.what}</span>
              {r.href ? (
                <Link href={r.href} className="text-brand-ink-2">
                  {r.where}
                </Link>
              ) : (
                <span className="text-brand-ink-2">{r.where}</span>
              )}
            </li>
          ))}
        </CardRows>
      )}
    </SectionCard>
  );
}
