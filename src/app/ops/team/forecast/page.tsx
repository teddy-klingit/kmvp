import { requireOpsPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardBody } from "@/components/ds/card";
import { CapacityForecastChart } from "@/components/ops/capacity-forecast-chart";

const WEEKS = 6;

export default async function CapacityForecastPage() {
  await requireOpsPage(["ADMIN", "PM"]);
  const [staff, teamMembers] = await Promise.all([
    prisma.staffMember.findMany(),
    prisma.teamMember.findMany({
      include: { team: { include: { project: true } } },
      where: { team: { project: { status: { notIn: ["ARCHIVED", "DELIVERED"] } } } },
    }),
  ]);

  const totalCapacity = staff.reduce((sum, s) => sum + s.capacityHoursPerWeek, 0);
  const now = new Date().getTime();
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
    <SectionCard title="Committed vs available hours" action={<span className="text-[12px] text-brand-ink-2">Next {WEEKS} weeks</span>}>
      <CardBody className="flex flex-col gap-3">
        <CapacityForecastChart data={data} />
        <p className="m-0 text-[13px] text-brand-ink-2">
          Weekly team capacity: {totalCapacity}h across {staff.length} people.
        </p>
      </CardBody>
    </SectionCard>
  );
}
