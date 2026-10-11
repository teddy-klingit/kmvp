import { getPortalViewer } from "@/lib/current-viewer";
import { PageHeader } from "@/components/ds/page-header";
import { PillLink } from "@/components/ds/pill-link";
import { Subscribe } from "@/components/portal/plan/subscribe";

/** Plan (Phase R, design 04): what you make, and when. Replaces Calendar (/calendar redirects here). */
export default async function PlanLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={`What you make, and when · ${viewer.client.name}`}
        title="Plan"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Subscribe />
            <PillLink href="/plan?add=1" variant="primary">
              + Add to plan
            </PillLink>
          </div>
        }
      />
      {children}
    </div>
  );
}
