import { prisma } from "@/lib/prisma";
import { SectionCard, CardRows, CardNote } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { formatDate } from "@/lib/utils";
import { FileText } from "lucide-react";
import { CATEGORIES, categoryFor, isCategory } from "@/lib/output-categories";
import { setOutputCategoryAction } from "@/lib/actions/output-fact-actions";
import { assetTitle } from "@/lib/asset-display";

export default async function ProjectFilesPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const projects = await prisma.project.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    include: { estimate: true, brief: true },
  });

  // Phase U: finished work in the client's Output library, with its category (automatic unless staff set one).
  const outputs = await prisma.asset.findMany({ where: { clientId, status: { in: ["APPROVED", "DELIVERED"] } }, include: { project: { select: { name: true, type: true } } }, orderBy: { createdAt: "desc" }, take: 200 });

  return (
    <>
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
    <SectionCard title="Output library categories" meta={<span className="text-[12px] text-brand-ink-2">Automatic from the format and project type unless you set one</span>}>
      {outputs.length === 0 ? (
        <CardNote>No finished work yet.</CardNote>
      ) : (
        <CardRows>
          {outputs.map((a) => {
            const auto = categoryFor({ format: a.format, type: a.type, channel: a.platform, projectType: a.project.type, title: a.name });
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[14px]">{assetTitle(a.name, a.format)}</span>
                  <span className="text-[12px] text-brand-ink-2">{a.project.name}</span>
                </span>
                <form action={setOutputCategoryAction} className="flex items-center gap-2">
                  <input type="hidden" name="assetId" value={a.id} />
                  <select name="category" defaultValue={isCategory(a.category) ? a.category : ""} aria-label={`Category of ${a.name}`} className="h-9 rounded-full border border-[#CFC8B8] bg-white px-3 text-[13px]">
                    <option value="">Automatic ({auto})</option>
                    {CATEGORIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                  <button type="submit" className="h-9 rounded-full border border-[#CFC8B8] px-3 font-brand-mono text-[11px]">
                    Save
                  </button>
                </form>
              </li>
            );
          })}
        </CardRows>
      )}
    </SectionCard>
    </>
  );
}
