import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import Link from "next/link";

export default async function TemplatesPage() {
  const viewer = await getPortalViewer();
  const templates = await prisma.template.findMany({
    where: { OR: [{ clientId: viewer.clientId }, { clientId: null }] },
    orderBy: { usageCount: "desc" },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your Figma templates ({templates.length})</h2>
        <Button variant="secondary" size="sm">
          Open in Figma
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {templates.map((t) => (
          <Link key={t.id} href={`/assets/agents-templates/templates/${t.id}`}>
            <Card className="overflow-hidden p-0 transition-colors hover:border-ink/30">
              <div className="flex aspect-video items-center justify-center text-white" style={{ backgroundColor: t.previewColor }}>
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
