import { requireOpsPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { PersonAvatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { jsonArray } from "@/lib/utils";
import { INTERNAL_ROLE_LABEL } from "@/lib/labels";

export default async function TeamRosterPage() {
  await requireOpsPage(["ADMIN", "PM"]);
  const staff = await prisma.staffMember.findMany({
    include: {
      user: true,
      teamMemberships: {
        include: { team: { include: { project: { include: { client: true } } } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader title="Team roster & capacity" addHref="/ops/team" />
        <div className="flex flex-col gap-4">
          {staff.map((s) => {
            const activeProjects = s.teamMemberships.filter(
              (m) => m.team.project.status !== "ARCHIVED" && m.team.project.status !== "DELIVERED"
            );
            const allocatedHours = activeProjects.reduce((sum, m) => sum + m.allocatedHours, 0);
            const utilization = Math.min(100, Math.round((allocatedHours / s.capacityHoursPerWeek) * 100));

            return (
              <Card key={s.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <PersonAvatar name={s.user.name} />
                  <div>
                    <p className="text-sm font-semibold">{s.user.name}</p>
                    <p className="text-xs text-muted-foreground">{INTERNAL_ROLE_LABEL[s.title]}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {jsonArray<string>(s.brandFitTags).map((tag) => (
                        <Badge key={tag} tone="neutral">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-1 sm:w-56">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {allocatedHours}h / {s.capacityHoursPerWeek}h
                    </span>
                    <span className="font-medium">{utilization}%</span>
                  </div>
                  <Progress value={utilization} indicatorClassName={utilization > 90 ? "bg-danger" : undefined} />
                </div>

                <div className="flex flex-wrap gap-1.5 sm:w-64 sm:justify-end">
                  {activeProjects.length === 0 ? (
                    <span className="text-xs text-muted-foreground">No active assignments</span>
                  ) : (
                    activeProjects.map((m) => (
                      <Badge key={m.id} tone="info">
                        {m.team.project.client.name} — {m.team.project.name}
                      </Badge>
                    ))
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </OpsPage>
  );
}
