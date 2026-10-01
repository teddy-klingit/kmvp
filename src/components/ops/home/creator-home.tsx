import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/utils";
import { PROJECT_STATUS_LABEL } from "@/lib/labels";
import type { StaffMember, User } from "@/generated/prisma";

export async function CreatorHome({ viewer }: { viewer: StaffMember & { user: User } }) {
  const memberships = await prisma.teamMember.findMany({
    where: {
      staffMemberId: viewer.id,
      team: { project: { status: { notIn: ["ARCHIVED", "DELIVERED"] } } },
    },
    include: { team: { include: { project: { include: { client: true } } } } },
    orderBy: { team: { project: { dueDate: "asc" } } },
  });

  const allocatedHours = memberships.reduce((sum, m) => sum + m.allocatedHours, 0);
  const utilization = Math.min(100, Math.round((allocatedHours / viewer.capacityHoursPerWeek) * 100));
  const nextDeadline = memberships.find((m) => m.team.project.dueDate)?.team.project.dueDate;
  const distinctClients = Array.from(new Map(memberships.map((m) => [m.team.project.client.id, m.team.project.client])).values());

  return (
    <OpsPage>
      <div className="flex flex-col gap-8">
        <PageHeader title={`Good morning, ${viewer.user.name.split(" ")[0]}.`} actions={<div />} />

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">{memberships.length}</p>
            <p className="text-xs text-muted-foreground">Active assignments</p>
          </Card>
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">
              {allocatedHours}h / {viewer.capacityHoursPerWeek}h
            </p>
            <p className="text-xs text-muted-foreground">Allocated this sprint</p>
          </Card>
          <Card className="border border-border bg-paper p-4">
            <p className="font-display text-2xl font-light">{nextDeadline ? formatDate(nextDeadline) : "—"}</p>
            <p className="text-xs text-muted-foreground">Next deadline</p>
          </Card>
          <Card className="flex flex-col justify-center gap-1.5 border border-border bg-paper p-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Utilization</span>
              <span className="font-semibold">{utilization}%</span>
            </div>
            <Progress value={utilization} indicatorClassName={utilization > 90 ? "bg-danger" : undefined} />
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>My assignments</SectionLabel>
          {memberships.length === 0 ? (
            <Card className="p-6">
              <p className="text-sm text-muted-foreground">No active project assignments right now.</p>
            </Card>
          ) : (
            <Card className="divide-y divide-border p-0">
              {memberships.map((m) => (
                <Link
                  key={m.id}
                  href={`/ops/projects/${m.team.project.id}#production`}
                  className="flex items-center justify-between gap-4 px-5 py-3.5 hover:bg-muted/50"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {m.team.project.client.name} · {m.team.project.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {m.roleOnProject} · {m.allocatedHours}h allocated
                      {m.team.project.dueDate && ` · due ${formatDate(m.team.project.dueDate)}`}
                    </p>
                  </div>
                  <Badge tone="info">{PROJECT_STATUS_LABEL[m.team.project.status]}</Badge>
                </Link>
              ))}
            </Card>
          )}
        </div>

        {distinctClients.length > 0 && (
          <div className="flex flex-col gap-3">
            <SectionLabel>Brand quick reference</SectionLabel>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {distinctClients.map((c) => (
                <Link key={c.id} href={`/ops/clients/${c.id}/brand-os`}>
                  <Card className="flex flex-col gap-1 p-4 transition-colors hover:border-ink/30">
                    <p className="text-sm font-semibold">{c.name} Brand OS</p>
                    <p className="text-xs text-muted-foreground">{c.brandSummary}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </OpsPage>
  );
}
