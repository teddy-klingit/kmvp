import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";

/** Ops → Team: Capacity · Forecast (the forecast used to be unreachable). */
export default async function TeamLayout({ children }: { children: React.ReactNode }) {
  const staff = await prisma.staffMember.findMany({ select: { capacityHoursPerWeek: true } });
  const capacity = staff.reduce((s, m) => s + m.capacityHoursPerWeek, 0);
  return (
    <OpsPage>
      <PageHeader
        eyebrow={`${staff.length} people · ${capacity}h a week`}
        title="Team"
        tabsLabel="Team views"
        tabs={[
          { label: "Capacity", href: "/ops/team" },
          { label: "Forecast", href: "/ops/team/forecast" },
        ]}
      />
      {children}
    </OpsPage>
  );
}
