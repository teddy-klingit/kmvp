import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { PageHeader } from "@/components/shared/page-header";
import { Card } from "@/components/ui/card";
import { LayoutGrid, ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/utils";

export default async function CustomAppsPage() {
  const viewer = await getPortalViewer();

  const apps = await prisma.clientApp.findMany({
    where: { clientId: viewer.clientId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Custom Apps" />
      <p className="-mt-4 text-sm text-muted-foreground">
        Tools built specifically for your account by Klingit — open any of them directly from here.
      </p>

      {apps.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <LayoutGrid className="size-6 text-muted-foreground" />
          <p className="text-sm font-medium">No custom apps yet</p>
          <p className="text-sm text-muted-foreground">
            When Klingit builds a tool tailored to your account, it&apos;ll show up here.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app) => (
            <a
              key={app.id}
              href={app.hostedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block"
            >
              <Card className="flex h-full flex-col gap-3 p-5 transition-colors hover:bg-muted">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-accent-soft text-ink">
                    <LayoutGrid className="size-4" />
                  </div>
                  <ExternalLink className="size-3.5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">{app.name}</p>
                  {app.description && <p className="mt-1 text-xs text-muted-foreground">{app.description}</p>}
                </div>
                <p className="mt-auto text-[11px] text-muted-foreground">Added {formatDate(app.createdAt)}</p>
              </Card>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
