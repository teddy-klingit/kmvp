import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardNote } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { PROJECT_TYPE_LABEL } from "@/lib/labels";

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "2-digit" }).format(d);
const STATUS: Record<string, string> = { DRAFT: "Draft", BRIEFING: "Briefing", ESTIMATING: "Estimating", STAFFING: "Staffing", IN_PRODUCTION: "In production", AWAITING_REVIEW: "In review", DELIVERED: "Delivered", PAUSED: "Paused", ARCHIVED: "Archived" };

/** Client workspace → Projects (Phase S, S7.3): every project, live first, with its estimate (PM + creative) and dates. */
export default async function ClientProjectsPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
  if (!client) notFound();
  const projects = await prisma.project.findMany({ where: { clientId, agentBuild: false }, include: { estimate: { select: { status: true, totalCredits: true, pmCredits: true, creativeCredits: true } } }, orderBy: [{ updatedAt: "desc" }] });
  const live = projects.filter((p) => !["DELIVERED", "ARCHIVED"].includes(p.status));
  const done = projects.filter((p) => ["DELIVERED", "ARCHIVED"].includes(p.status));
  const table = (rows: typeof projects) => (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-[14px]">
        <thead>
          <tr className="text-left text-[12px] text-brand-ink-2">
            {["Project", "Type", "Status", "Estimate", "Due"].map((h) => (
              <th key={h} className="px-3 py-2.5 font-medium first:pl-6 last:pr-6">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-brand-line">
              <td className="py-3 pl-6 pr-3">
                <Link href={`/ops/projects/${p.id}`} className="text-brand-ink">
                  {p.name}
                </Link>
              </td>
              <td className="px-3 py-3 text-brand-ink-2">{PROJECT_TYPE_LABEL[p.type] ?? p.type}</td>
              <td className="px-3 py-3">
                <StatusPill>{STATUS[p.status] ?? p.status}</StatusPill>
              </td>
              <td className="px-3 py-3 text-[13px] tabular-nums">{p.estimate ? `${p.estimate.totalCredits} · PM ${p.estimate.pmCredits} · creative ${p.estimate.creativeCredits} (${p.estimate.status.toLowerCase()})` : "—"}</td>
              <td className="py-3 pl-3 pr-6 text-brand-ink-2">{p.dueDate ? day(p.dueDate) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <>
      <SectionCard title="Live projects" meta={<span className="text-[12px] text-brand-ink-2">{live.length}</span>}>
        {live.length ? table(live) : <CardNote>No live projects.</CardNote>}
      </SectionCard>
      {done.length > 0 && <SectionCard title="Delivered and archived">{table(done)}</SectionCard>}
    </>
  );
}
