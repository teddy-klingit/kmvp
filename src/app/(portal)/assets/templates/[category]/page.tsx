import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { SectionCard } from "@/components/ds/card";
import { formatDate } from "@/lib/utils";

export default async function TemplateCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const decoded = decodeURIComponent(category);
  const viewer = await getPortalViewer();

  const templates = await prisma.template.findMany({
    where: { category: decoded, OR: [{ clientId: viewer.clientId }, { clientId: null }] },
    orderBy: { usageCount: "desc" },
  });
  if (templates.length === 0) notFound();

  return (
    <SectionCard
      title={decoded}
      meta={
        <span className="font-brand-mono text-[12px] text-brand-ink-2">
          {templates.length} TEMPLATE{templates.length === 1 ? "" : "S"}
        </span>
      }
    >
      <ul className="m-0 grid list-none grid-cols-1 gap-4 px-6 py-5 sm:grid-cols-2 lg:grid-cols-4">
        {templates.map((t, i) => (
          <li key={t.id} className="animate-in fade-in slide-in-from-bottom-1 duration-300" style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}>
            <Link href={`/assets/agents-templates/templates/${t.id}`} className="block h-full no-underline">
              <TemplateTile name={t.name} category={t.category} color={t.previewColor} updated={formatDate(t.createdAt)} />
            </Link>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function TemplateTile({ name, category, color, updated }: { name: string; category: string; color: string; updated: string }) {
  return (
    <span className="flex h-full flex-col overflow-hidden rounded-[10px] bg-brand-chip text-brand-ink transition-colors hover:bg-brand-line">
      <span className="flex aspect-video items-center justify-center text-white" style={{ backgroundColor: color }}>
        <span className="text-[24px] font-light opacity-80">F</span>
      </span>
      <span className="flex flex-col gap-0.5 p-4">
        <span className="text-[15px]">{name}</span>
        <span className="text-[13px] text-brand-ink-2">{category}</span>
        <span className="mt-1 font-brand-mono text-[11px] text-brand-ink-2">UPDATED {updated.toUpperCase()}</span>
      </span>
    </span>
  );
}
