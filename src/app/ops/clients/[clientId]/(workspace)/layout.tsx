import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ds/page-header";
import { PillLink } from "@/components/ds/pill-link";
import { requireOpsPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { OUHERS_CLIENT_ID } from "@/lib/demo/ouhers";
import { ResetDemoButton } from "@/components/ops/reset-demo-button";
import { ClientTabs } from "@/components/ops/client/client-tabs";
import { clientHeader } from "@/lib/client-header";
import { hasAdmin } from "@/lib/role-tier";
import { viewClientAction } from "@/lib/actions/cockpit-actions";
import { MessagePmButton, PmPanelProvider } from "@/components/pm-panel/pm-panel-provider";

/**
 * One client (Phase T, design PMClient): the header read from the contract, then 5 tabs (Overview · Projects ·
 * Plan · Contract & billing · Brand). Every older view lives under one of them.
 */
export default async function ClientWorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  // Client detail holds contracts, balances and billing: admins and PMs only.
  const viewer = await requireOpsPage(["ADMIN", "PM"]);
  const { clientId } = await params;
  const h = await clientHeader(clientId, viewer.id);
  const base = `/ops/clients/${clientId}`;
  const [projects, plan] = await Promise.all([
    prisma.project.count({ where: { clientId, status: { notIn: ["ARCHIVED", "DELIVERED", "DRAFT"] } } }),
    prisma.clientCalendarItem.count({ where: { clientId, archivedAt: null, date: { gte: new Date() } } }),
  ]);
  const line = [
    h.contact ? `${h.contact.name}${h.contact.admin ? " (admin)" : ""}` : null,
    `${h.people} ${h.people === 1 ? "person" : "people"}`,
    h.markets.length ? `markets ${h.markets.join(", ")}` : null,
    h.pm ? (h.pm.isViewer ? "you are their Marketing PM" : `Marketing PM: ${h.pm.name}`) : "no Marketing PM yet",
  ].filter(Boolean);

  // This client's messages open from anywhere on its page (and on arrival from a notification, ?message=1).
  return (
    <PmPanelProvider side="staff" defaultClientId={clientId}>
    <div className="h-full overflow-y-auto px-4 pb-12 pt-5 min-[900px]:pb-14 min-[900px]:pl-4 min-[900px]:pr-10 min-[900px]:pt-10">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6">
        <div className="flex flex-col gap-2">
          <PageHeader
            back={{ href: "/ops/clients", label: "Clients" }}
            eyebrow={h.eyebrow}
            title={h.client.name}
            actions={
              <>
                {h.contact && (
                  <MessagePmButton clientId={clientId} className="inline-flex h-10 items-center rounded-full border border-[#CFC8B8] bg-white px-4 font-brand-mono text-[12px] hover:border-brand-ink">
                    Message {h.contact.first}
                  </MessagePmButton>
                )}
                {h.client.isDemo && (
                  <form action={viewClientAction}>
                    <input type="hidden" name="clientId" value={clientId} />
                    <button type="submit" className="inline-flex h-10 items-center rounded-full border border-[#CFC8B8] bg-white px-4 font-brand-mono text-[12px] hover:border-brand-ink">
                      Open as client
                    </button>
                  </form>
                )}
                <PillLink href={`/ops/projects/new?clientId=${clientId}`} variant="primary">
                  <Plus className="size-3.5" strokeWidth={1.75} />
                  New project
                </PillLink>
                {clientId === OUHERS_CLIENT_ID && <ResetDemoButton clientId={clientId} />}
              </>
            }
          />
          <span className="text-[14px] text-brand-ink-2">{line.join(" · ")}</span>
        </div>
        <ClientTabs admin={hasAdmin(viewer)} base={base} counts={{ projects, plan }} />
        {children}
      </div>
    </div>
    </PmPanelProvider>
  );
}
