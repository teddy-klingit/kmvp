import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { Card, SectionLabel } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { PROJECT_STATUS_LABEL } from "@/lib/labels";

export default async function ClientOpsDashboardPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const [projects, client] = await Promise.all([
    prisma.project.findMany({
      where: { clientId, status: { not: "DRAFT" } },
      orderBy: { createdAt: "desc" },
      include: { assets: true },
    }),
    prisma.client.findUniqueOrThrow({ where: { id: clientId }, include: { brandOS: true } }),
  ]);

  const active = projects.filter((p) => p.status !== "ARCHIVED" && p.status !== "DELIVERED");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="border border-border bg-paper p-4">
          <p className="font-display text-2xl font-light">{active.length}</p>
          <p className="text-xs text-muted-foreground">Active projects</p>
        </Card>
        <Card className="border border-border bg-paper p-4">
          <p className="font-display text-2xl font-light">{client.creditBalance}c</p>
          <p className="text-xs text-muted-foreground">Credits remaining</p>
        </Card>
        <Card className="border border-border bg-paper p-4">
          <p className="font-display text-2xl font-light">{client.brandOS?.foundationPct ?? 0}%</p>
          <p className="text-xs text-muted-foreground">Foundation health</p>
        </Card>
        <Card className="border border-border bg-paper p-4">
          <p className="font-display text-2xl font-light">{client.healthScore}</p>
          <p className="text-xs text-muted-foreground">Account health</p>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>All projects</SectionLabel>
        <Card className="divide-y divide-border p-0">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/ops/clients/${clientId}/delivery`}
              className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/50"
            >
              <div>
                <p className="text-sm font-medium">{p.name}</p>
                <p className="text-xs text-muted-foreground">{p.assets.length} assets</p>
              </div>
              <div className="flex items-center gap-4">
                <p className="text-xs text-muted-foreground">{p.dueDate && formatDate(p.dueDate)}</p>
                <StatusBadge status={PROJECT_STATUS_LABEL[p.status]} />
              </div>
            </Link>
          ))}
        </Card>
      </div>
    </div>
  );
}
