import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { SectionCard, CardNote } from "@/components/ds/card";
import { LayoutTemplate } from "lucide-react";

export default async function TemplatesLandingPage() {
  const viewer = await getPortalViewer();
  const templates = await prisma.template.findMany({
    where: { OR: [{ clientId: viewer.clientId }, { clientId: null }] },
    orderBy: { category: "asc" },
  });

  const byCategory = new Map<string, { count: number; color: string }>();
  for (const t of templates) {
    const existing = byCategory.get(t.category);
    if (existing) existing.count += 1;
    else byCategory.set(t.category, { count: 1, color: t.previewColor });
  }

  return (
    <SectionCard title="Templates" meta={byCategory.size > 0 ? <span className="font-brand-mono text-[12px] text-brand-ink-2">{templates.length}</span> : undefined}>
      <p className="m-0 px-6 pt-4 text-[13px] leading-[1.5] text-brand-ink-2">Ready-to-use Figma templates for every content format your team ships.</p>
      {byCategory.size === 0 ? (
        <CardNote>No templates yet.</CardNote>
      ) : (
        <ul className="m-0 grid list-none grid-cols-2 gap-3 px-6 py-5 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from(byCategory.entries()).map(([category, { count, color }], i) => (
            <li key={category} className="animate-in fade-in slide-in-from-bottom-1 duration-300" style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}>
              <Link
                href={`/assets/templates/${encodeURIComponent(category)}`}
                className="flex h-full flex-col gap-3 rounded-[10px] bg-brand-chip p-4 text-brand-ink no-underline transition-colors hover:bg-brand-line"
              >
                <span className="flex size-9 items-center justify-center rounded-[8px] text-white" style={{ backgroundColor: color }}>
                  <LayoutTemplate className="size-4" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px]">{category}</span>
                  <span className="font-brand-mono text-[11px] text-brand-ink-2">
                    {count} TEMPLATE{count === 1 ? "" : "S"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
