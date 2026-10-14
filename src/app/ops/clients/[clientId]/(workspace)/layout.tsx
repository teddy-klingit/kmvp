import { IntelligenceRail } from "@/components/ops/intelligence-rail";
import { PageHeader } from "@/components/ds/page-header";
import { getClientWorkspace } from "@/lib/data/ops-client-workspace";
import { requireOpsPage } from "@/lib/authz";
import { PLAN_TIER_LABEL } from "@/lib/labels";
import { roleTierFor } from "@/lib/role-tier";
import { OUHERS_CLIENT_ID } from "@/lib/demo/ouhers";
import { ResetDemoButton } from "@/components/ops/reset-demo-button";

const STATUS: Record<string, string> = { ACTIVE: "Active", ONBOARDING: "Onboarding", PAUSED: "Paused", OFFBOARDED: "Offboarded" };

/**
 * One client's workspace (ops): one header with a single segmented control for every view, and the intelligence rail
 * on the right on wide screens. Phase S: Overview · Contract · Balances · Projects · Plan · Billing · Activity first.
 */
export default async function ClientWorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  // Client detail (Phase S, S7.3) holds contracts, balances and billing: admins and PMs only.
  const viewer = await requireOpsPage(["ADMIN", "PM"]);
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
            eyebrow={[PLAN_TIER_LABEL[client.planTier] ?? client.planTier, STATUS[client.status] ?? client.status, client.isDemo ? "Demo account" : null].filter(Boolean).join(" · ")}
            actions={client.id === OUHERS_CLIENT_ID && roleTierFor(viewer.title) !== "CREATOR" ? <ResetDemoButton clientId={client.id} /> : undefined}
            title={client.name}
            tabsLabel="Client workspace"
            tabs={[
              { label: "Overview", href: `${base}/dashboard` },
              { label: "Contract", href: `${base}/contract` },
              { label: "Balances", href: `${base}/balances` },
              { label: "Projects", href: `${base}/projects` },
              { label: "Plan", href: `${base}/plan` },
              { label: "Billing", href: `${base}/billing` },
              { label: "Activity", href: `${base}/activity` },
              { label: "Brand OS", href: `${base}/brand-os` },
              { label: "Brand assets", href: `${base}/brand-assets` },
              { label: "Opportunities", href: `${base}/opportunities` },
              { label: "Content plan", href: `${base}/content-plan` },
              { label: "Custom apps", href: `${base}/custom-apps` },
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
