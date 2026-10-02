import Link from "next/link";
import { LayoutTemplate } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { SectionCard, CardNote } from "@/components/ds/card";
import { pillClass } from "@/components/ds/button";

/** Brand OS → Agents & templates → Templates: one card per template with a preview, its format, real uses and Use. */
export default async function TemplatesPage() {
  const viewer = await getPortalViewer();
  const templates = await prisma.template.findMany({
    where: { OR: [{ clientId: viewer.clientId }, { clientId: null }] },
    orderBy: [{ usageCount: "desc" }, { name: "asc" }],
  });

  return (
    <SectionCard className="@container/col" title="Templates" meta={templates.length > 0 ? <span className="text-[13px] text-brand-ink-2">{templates.length}</span> : undefined}>
      {templates.length === 0 ? (
        <CardNote>No templates yet. Klingit adds them as your design system grows.</CardNote>
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-4 px-6 py-5 @min-[520px]/col:grid-cols-2 @min-[860px]/col:grid-cols-3">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-col overflow-hidden rounded-[12px] border border-brand-line bg-white">
              <Link href={`/assets/agents-templates/templates/${t.id}`} aria-label={`${t.name}: details`} className="flex aspect-[16/9] items-center justify-center text-brand-ink no-underline" style={{ backgroundColor: `color-mix(in srgb, ${t.previewColor} 22%, white)` }}>
                <LayoutTemplate className="size-8 opacity-60" strokeWidth={1.25} />
              </Link>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <Link href={`/assets/agents-templates/templates/${t.id}`} className="text-[15px] text-brand-ink no-underline hover:underline">
                  {t.name}
                </Link>
                <span className="text-[13px] text-brand-ink-2">{t.category}</span>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="text-[13px] text-brand-mute">{t.usageCount ? `Used ${t.usageCount}×` : "Not used yet"}</span>
                  <a href={`/api/templates/${t.id}/use`} target={t.figmaUrl ? "_blank" : undefined} rel="noreferrer" className={pillClass("secondary", "sm")}>
                    Use
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
