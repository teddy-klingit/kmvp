import { LayoutGrid, ExternalLink } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/ds/page-header";
import { SectionCard, CardRows } from "@/components/ds/card";
import { EmptyState } from "@/components/ds/empty-state";

/** Custom apps: tools Klingit built for this account, each opening in a new tab. */
export default async function CustomAppsPage() {
  const viewer = await getPortalViewer();

  const apps = await prisma.clientApp.findMany({
    where: { clientId: viewer.clientId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={apps.length > 0 ? `${apps.length} app${apps.length === 1 ? "" : "s"} · built by Klingit` : "Built by Klingit"} title="Custom apps" />

      {apps.length === 0 ? (
        <EmptyState
          icon={LayoutGrid}
          title="No custom apps yet."
          description="When Klingit builds a tool tailored to your account, it'll show up here."
        />
      ) : (
        <SectionCard
          title="Your apps"
          meta={<span className="text-[13px] text-brand-ink-2">Tools built specifically for your account. Open any of them directly from here.</span>}
        >
          <CardRows>
            {apps.map((app) => (
              <li key={app.id}>
                <a
                  href={app.hostedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-4 px-6 py-4 text-brand-ink no-underline transition-colors hover:bg-brand-chip"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-brand-chip">
                    <LayoutGrid className="size-[18px]" strokeWidth={1.75} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[15px]">{app.name}</span>
                    {app.description && <span className="text-[13px] text-brand-ink-2">{app.description}</span>}
                    <span className="font-brand-mono text-[11px] text-brand-ink-2 sm:hidden">Added {formatDate(app.createdAt)}</span>
                  </span>
                  <span className="hidden shrink-0 font-brand-mono text-[11px] text-brand-ink-2 sm:inline">Added {formatDate(app.createdAt)}</span>
                  <ExternalLink className="size-4 shrink-0 text-brand-ink-2" strokeWidth={1.75} aria-label="Opens in a new tab" />
                </a>
              </li>
            ))}
          </CardRows>
        </SectionCard>
      )}
    </div>
  );
}
