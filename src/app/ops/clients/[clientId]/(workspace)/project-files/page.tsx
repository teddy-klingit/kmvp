import { prisma } from "@/lib/prisma";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
    <div className="flex flex-col gap-3">
      <SectionLabel>Project documents</SectionLabel>
      <Card className="divide-y divide-border p-0">
        {projects.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-3">
              <FileText className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{p.name} — brief & estimate</p>
                <p className="text-xs text-muted-foreground">
                  Updated {formatDate(p.updatedAt, { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              {p.brief && <Badge tone="neutral">Brief</Badge>}
              {p.estimate && <Badge tone="neutral">Estimate</Badge>}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
