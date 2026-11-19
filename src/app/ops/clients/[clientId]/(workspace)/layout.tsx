import Link from "next/link";
import { Plus } from "lucide-react";
import { noteCount } from "@/lib/client-notes";
import { onboarding } from "@/lib/client-onboarding";
import { cn } from "@/lib/utils";
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

const HEADER_BUTTON = "inline-flex h-10 items-center rounded-full border border-[#CFC8B8] bg-white px-4 font-brand-mono text-[12px] text-brand-ink no-underline hover:border-brand-ink";
const STATUS_PILL = { Onboarding: "bg-[#EEF1FA] text-[#3E4E8C]", Active: "bg-[#EEF4DA] text-[#5E6B2A]", Paused: "bg-brand-chip text-brand-ink-2", Ending: "bg-[#FFF1E8] text-brand-orange-text" } as const;

/**
 * One client (Phase T2, designs PMClient / PMClientNew): the header read from the contract with a status pill and
 * + Note · Log a call · Message · + New project, then Overview · Projects · Planner · Credits · Notes (staff) · Brand.
 */
export default async function ClientWorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ clientId: string }> }) {
  // Client detail holds contracts, balances and billing: admins and PMs only.
  const viewer = await requireOpsPage(["ADMIN", "PM"]);
  const { clientId } = await params;
  const h = await clientHeader(clientId, viewer.id);
  const base = `/ops/clients/${clientId}`;
  const [projects, plan, notes, ob] = await Promise.all([
    prisma.project.count({ where: { clientId, status: { notIn: ["ARCHIVED", "DELIVERED", "DRAFT"] } } }),
    prisma.clientCalendarItem.count({ where: { clientId, archivedAt: null, date: { gte: new Date() } } }),
    noteCount(clientId),
    onboarding(clientId),
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
            title={
              <span className="inline-flex flex-wrap items-center gap-3">
                {h.client.name}
                {ob.status && <span className={cn("rounded-full px-3 py-1 align-middle font-brand text-[13px] font-fw-regular tracking-normal", STATUS_PILL[ob.status])}>{ob.status}</span>}
              </span>
            }
            actions={
              <>
                <Link href={`${base}/notes#compose`} className={HEADER_BUTTON}>
                  + Note
                </Link>
                <Link href={`${base}/notes?kind=call#compose`} className={HEADER_BUTTON}>
                  Log a call
                </Link>
                {h.contact && (
                  <MessagePmButton clientId={clientId} className={HEADER_BUTTON}>
                    Message {h.contact.first}
                  </MessagePmButton>
                )}
                <PillLink href={`/ops/projects/new?clientId=${clientId}`} variant="primary">
                  <Plus className="size-3.5" strokeWidth={1.75} />
                  New project
                </PillLink>
                {h.client.isDemo && (
                  <form action={viewClientAction}>
                    <input type="hidden" name="clientId" value={clientId} />
                    <button type="submit" className={HEADER_BUTTON}>
                      Open as client
                    </button>
                  </form>
                )}
                {clientId === OUHERS_CLIENT_ID && <ResetDemoButton clientId={clientId} />}
              </>
            }
          />
          <span className="text-[14px] text-brand-ink-2">{line.join(" · ")}</span>
        </div>
        <ClientTabs admin={hasAdmin(viewer)} base={base} counts={{ projects, plan, notes }} />
        {children}
      </div>
    </div>
    </PmPanelProvider>
  );
}
