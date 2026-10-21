import Link from "next/link";
import { getPortalViewer } from "@/lib/current-viewer";
import { PageHeader } from "@/components/ds/page-header";
import { PillLink } from "@/components/ds/pill-link";
import { Subscribe } from "@/components/portal/plan/subscribe";
import { prisma } from "@/lib/prisma";
import { newWhere } from "@/lib/opportunities";

/**
 * Planner (was Plan; Phase R, design 04): what you make, and when. Replaces Calendar (/calendar redirects here).
 * Phase W: Opportunities moved to the main nav; Planner keeps its calendar and a link to the new ones.
 */
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
      />
      {fresh > 0 && (
        <Link href="/opportunities" className="-mt-2 self-start text-[14px] text-brand-ink underline underline-offset-4">
          {fresh} new opportunit{fresh === 1 ? "y" : "ies"} ›
        </Link>
      )}
      {children}
    </div>
  );
}
