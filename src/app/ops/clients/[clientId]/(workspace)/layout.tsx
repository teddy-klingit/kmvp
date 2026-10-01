import { MoreHorizontal, Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NavTabs } from "@/components/ui/nav-tabs";
import { IntelligenceRail } from "@/components/ops/intelligence-rail";
import { getClientWorkspace } from "@/lib/data/ops-client-workspace";
import { getOpsViewer } from "@/lib/current-viewer";

export default async function ClientWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ clientId: string }>;
}) {
  await getOpsViewer();
  const { clientId } = await params;
  const workspace = await getClientWorkspace(clientId);
  const { client } = workspace;

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-y-auto px-10 py-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-light tracking-tight">{client.name}</h1>
            <button className="text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="size-4" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search" className="h-9 w-48 rounded-full bg-card pl-8" />
            </div>
            <Button size="icon" className="rounded-full">
              <Plus className="size-4" />
            </Button>
          </div>
        </div>

        <NavTabs
          className="mt-4"
          items={[
            { label: "Dashboard", href: `/ops/clients/${clientId}/dashboard` },
            { label: "Brand assets", href: `/ops/clients/${clientId}/brand-assets` },
            { label: "Delivery", href: `/ops/clients/${clientId}/delivery` },
            { label: "Project files", href: `/ops/clients/${clientId}/project-files` },
            { label: "Custom apps", href: `/ops/clients/${clientId}/custom-apps` },
            { label: "Content plan", href: `/ops/clients/${clientId}/content-plan` },
          ]}
        />

        <div className="pt-6">{children}</div>
      </div>
      <IntelligenceRail {...workspace} />
    </div>
  );
}
