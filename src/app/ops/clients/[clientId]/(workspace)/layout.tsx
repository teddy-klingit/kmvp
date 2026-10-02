import { IntelligenceRail } from "@/components/ops/intelligence-rail";
import { PageHeader } from "@/components/ds/page-header";
import { getClientWorkspace } from "@/lib/data/ops-client-workspace";
import { getOpsViewer } from "@/lib/current-viewer";
import { PLAN_TIER_LABEL } from "@/lib/labels";

const STATUS: Record<string, string> = { ACTIVE: "Active", ONBOARDING: "Onboarding", PAUSED: "Paused", OFFBOARDED: "Offboarded" };

/**
 * One client's workspace (ops): one header with a single segmented control for every view (it used to be
 * two overlapping tab bars), and the intelligence rail on the right on wide screens.
 */
export default async function ClientWorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  await getOpsViewer();
  const { clientId } = await params;
  const workspace = await getClientWorkspace(clientId);
  const { client } = workspace;
  const base = `/ops/clients/${clientId}`;

  return (
    <div className="flex h-full">
      <div className="min-w-0 flex-1 overflow-y-auto px-4 pb-12 pt-5 min-[900px]:pb-14 min-[900px]:pl-4 min-[900px]:pr-10 min-[900px]:pt-10">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6">
          <PageHeader
            back={{ href: "/ops/clients", label: "Clients" }}
            eyebrow={[PLAN_TIER_LABEL[client.planTier] ?? client.planTier, STATUS[client.status] ?? client.status].join(" · ")}
            title={client.name}
            tabsLabel="Client workspace"
            tabs={[
              { label: "Dashboard", href: `${base}/dashboard` },
              { label: "Delivery", href: `${base}/delivery` },
              { label: "Brand assets", href: `${base}/brand-assets` },
              { label: "Brand OS", href: `${base}/brand-os` },
              { label: "Content plan", href: `${base}/content-plan` },
              { label: "Custom apps", href: `${base}/custom-apps` },
              { label: "Project files", href: `${base}/project-files` },
              { label: "Admin", href: `${base}/admin` },
            ]}
          />
          {children}
        </div>
      </div>
      <div className="hidden min-[1200px]:flex">
        <IntelligenceRail {...workspace} />
      </div>
    </div>
  );
}
