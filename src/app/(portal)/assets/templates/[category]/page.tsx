import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card } from "@/components/ui/card";
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
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">{decoded}</h2>
        <p className="text-sm text-muted-foreground">
          {templates.length} template{templates.length === 1 ? "" : "s"}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {templates.map((t, i) => (
          <Link
            key={t.id}
            href={`/assets/agents-templates/templates/${t.id}`}
            className="animate-in fade-in slide-in-from-bottom-1 duration-300"
            style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}
          >
            <Card className="overflow-hidden p-0 transition-colors hover:border-ink/30">
              <div
                className="flex aspect-video items-center justify-center text-white"
                style={{ backgroundColor: t.previewColor }}
              >
                <span className="font-display text-2xl font-light opacity-80">F</span>
              </div>
              <div className="p-4">
                <p className="text-sm font-semibold">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.category}</p>
                <p className="mt-1 text-xs text-muted-foreground">Updated {formatDate(t.createdAt)}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
