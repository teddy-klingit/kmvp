import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { PROJECT_STATUS_LABEL } from "@/lib/labels";

const COLUMNS = [
  "BRIEFING",
  "ESTIMATING",
  "STAFFING",
  "IN_PRODUCTION",
  "QA",
  "AWAITING_REVIEW",
  "IN_FEEDBACK",
  "DELIVERED",
] as const;

export default async function CrossClientProjectsPage() {
  const projects = await prisma.project.findMany({
    where: { status: { notIn: ["ARCHIVED", "DRAFT"] } },
    include: { client: true, team: { include: { members: { include: { staffMember: { include: { user: true } } } } } } },
    orderBy: { dueDate: "asc" },
  });

  const byStatus = new Map<string, typeof projects>();
  for (const p of projects) {
    const list = byStatus.get(p.status) ?? [];
    list.push(p);
    byStatus.set(p.status, list);
  }

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader title="Projects" addHref="/ops/projects/new" />
        <div className="flex gap-4 overflow-x-auto pb-4">
          {COLUMNS.map((status) => {
            const items = byStatus.get(status) ?? [];
            return (
              <div key={status} className="flex w-64 shrink-0 flex-col gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {PROJECT_STATUS_LABEL[status]} <span className="text-muted-foreground/70">({items.length})</span>
                </p>
                <div className="flex flex-col gap-3">
                  {items.map((p) => (
                    <Link key={p.id} href={`/ops/clients/${p.clientId}/delivery`}>
                      <Card className="flex flex-col gap-2 p-4 transition-colors hover:border-ink/30">
                        <p className="text-sm font-semibold">{p.client.name}</p>
                        <p className="text-sm text-muted-foreground">{p.name}</p>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-muted-foreground">
                            {p.team?.members[0]?.staffMember.user.name.split(" ")[0] ?? "Unassigned"}
                          </p>
                          <p className="text-xs text-muted-foreground">{p.dueDate && formatDate(p.dueDate)}</p>
                        </div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </OpsPage>
  );
}
