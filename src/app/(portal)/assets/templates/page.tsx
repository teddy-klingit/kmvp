import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card } from "@/components/ui/card";
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
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Templates</h2>
        <p className="text-sm text-muted-foreground">
          Ready-to-use Figma templates for every content format your team ships.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from(byCategory.entries()).map(([category, { count, color }], i) => (
          <Link
            key={category}
            href={`/assets/templates/${encodeURIComponent(category)}`}
            className="animate-in fade-in slide-in-from-bottom-1 duration-300"
            style={{ animationDelay: `${i * 40}ms`, animationFillMode: "backwards" }}
          >
            <Card className="flex flex-col gap-3 p-5 transition-colors hover:border-ink/30">
              <span
                className="flex size-9 items-center justify-center rounded-lg text-white"
                style={{ backgroundColor: color }}
              >
                <LayoutTemplate className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">{category}</p>
                <p className="text-xs text-muted-foreground">
                  {count} template{count === 1 ? "" : "s"}
                </p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
