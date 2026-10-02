import { prisma } from "@/lib/prisma";
import { SectionCard, CardRows, CardNote } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { formatDate } from "@/lib/utils";
import { FileText } from "lucide-react";

export default async function ProjectFilesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const projects = await prisma.project.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: { estimate: true, brief: true },
  });

  return (
    <SectionCard title="Project documents" meta={<span className="font-brand-mono text-[12px] text-brand-ink-2">{projects.length}</span>}>
      {projects.length === 0 ? (
        <CardNote>No projects for this client yet.</CardNote>
      ) : (
        <CardRows>
          {projects.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-brand-chip">
                <FileText className="size-4 text-brand-ink-2" strokeWidth={1.75} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[15px]">{p.name}: brief &amp; estimate</span>
                <span className="text-[13px] text-brand-ink-2">Updated {formatDate(p.updatedAt, { day: "2-digit", month: "short", year: "numeric" })}</span>
              </div>
              {(p.brief || p.estimate) && (
                <span className="flex gap-1.5">
                  {p.brief && <StatusPill>Brief</StatusPill>}
                  {p.estimate && <StatusPill>Estimate</StatusPill>}
                </span>
              )}
            </li>
          ))}
        </CardRows>
      )}
    </SectionCard>
  );
}
