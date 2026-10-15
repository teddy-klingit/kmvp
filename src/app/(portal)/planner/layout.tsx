import { getPortalViewer } from "@/lib/current-viewer";
import { PageHeader } from "@/components/ds/page-header";
import { PillLink } from "@/components/ds/pill-link";
import { Subscribe } from "@/components/portal/plan/subscribe";
import { prisma } from "@/lib/prisma";
import { newWhere } from "@/lib/opportunities";

/** Planner (was Plan; Phase R, designs 04 and 06): what you make, and when, and what you could make next. Replaces Calendar (/calendar redirects here). */
export default async function PlanLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  const fresh = await prisma.opportunity.count({ where: newWhere(viewer.clientId) });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`What you make, and when · ${viewer.client.name}`}
        title="Planner"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Subscribe />
            <PillLink href="/planner?add=1" variant="primary">
              + Add to plan
            </PillLink>
          </div>
        }
        tabsLabel="Planner sections"
        tabs={[
          { label: "Calendar", href: "/planner" },
          { label: "Opportunities", href: "/planner/opportunities", badge: fresh ? `${fresh} new` : undefined },
        ]}
      />
      {children}
    </div>
  );
}
