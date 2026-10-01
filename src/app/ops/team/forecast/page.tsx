import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { CapacityForecastChart } from "@/components/ops/capacity-forecast-chart";

const WEEKS = 6;

export default async function CapacityForecastPage() {
  const [staff, teamMembers] = await Promise.all([
    prisma.staffMember.findMany(),
    prisma.teamMember.findMany({
      include: { team: { include: { project: true } } },
      where: { team: { project: { status: { notIn: ["ARCHIVED", "DELIVERED"] } } } },
    }),
  ]);

  const totalCapacity = staff.reduce((sum, s) => sum + s.capacityHoursPerWeek, 0);
  const now = Date.now();
  const week = 7 * 86400000;

  const data = Array.from({ length: WEEKS }, (_, i) => {
    const weekStart = now + i * week;
    const weekEnd = weekStart + week;
    const committed = teamMembers
      .filter((m) => {
        const due = m.team.project.dueDate?.getTime();
        return due && due >= weekStart && due < weekEnd + week; // ongoing work bleeds slightly past due
      })
      .reduce((sum, m) => sum + m.allocatedHours, 0);

    return {
      week: `Wk ${i + 1}`,
      committed: Math.round(committed),
      available: Math.max(0, totalCapacity - Math.round(committed)),
    };
  });

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader title="Capacity forecast" addHref="/ops/team" />
        <div className="flex flex-col gap-3">
          <SectionLabel>Committed vs. available hours — next {WEEKS} weeks</SectionLabel>
          <Card className="p-5">
            <CapacityForecastChart data={data} />
          </Card>
        </div>
        <p className="text-sm text-muted-foreground">
          Total weekly team capacity: {totalCapacity}h across {staff.length} staff.
        </p>
      </div>
    </OpsPage>
  );
}
