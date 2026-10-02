import { Plus } from "lucide-react";
import { requireOpsPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { clientHealthMap } from "@/lib/client-health";
import { formatDate } from "@/lib/utils";
import { PLAN_TIER_LABEL } from "@/lib/labels";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { FilterChips } from "@/components/ds/filter-chips";
import { SectionCard, CardNote } from "@/components/ds/card";
import { DataTable, HealthDot } from "@/components/ds/data-table";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { PillLink } from "@/components/ds/pill-link";

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  ACTIVE: { label: "Active", tone: "success" },
  ONBOARDING: { label: "Onboarding", tone: "neutral" },
  PAUSED: { label: "Paused", tone: "watch" },
  OFFBOARDED: { label: "Offboarded", tone: "neutral" },
};

/** "Teddy Wold" → "Teddy W." */
function shortName(name: string) {
  const [first, ...rest] = name.split(" ");
  return rest.length ? `${first} ${rest[rest.length - 1].charAt(0)}.` : first;
}

/**
 * Ops → Clients (OpsClients.dc.html): header + filter chips + one card holding the table. Health is computed
 * (src/lib/client-health.ts), never the stored score; "At risk" means health under 75.
 */
export default async function ClientsDirectoryPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireOpsPage(["ADMIN", "PM"]);
  const { show } = await searchParams;
  const [clients, health] = await Promise.all([
    prisma.client.findMany({
      include: { accountLead: { include: { user: true } }, projects: { where: { status: { notIn: ["ARCHIVED", "DELIVERED", "DRAFT"] } }, select: { id: true } } },
      orderBy: { name: "asc" },
    }),
    clientHealthMap(),
  ]);
  const atRisk = clients.filter((c) => health.get(c.id)?.atRisk).length;
  const visible = clients.filter((c) => (show === "active" ? c.status === "ACTIVE" : show === "risk" ? health.get(c.id)?.atRisk : true));

  return (
    <OpsPage>
      <PageHeader
        eyebrow={`${clients.length} client${clients.length === 1 ? "" : "s"} · ${atRisk} at risk`}
        title="Clients"
        actions={
          <PillLink href="/ops/clients/new" variant="primary">
            <Plus className="size-3.5" strokeWidth={1.75} />
            New client
          </PillLink>
        }
      />
      <FilterChips
        label="Filter clients"
        items={[
          { label: "All", href: "/ops/clients", active: !show },
          { label: "Active", href: "/ops/clients?show=active", active: show === "active" },
          { label: "At risk", href: "/ops/clients?show=risk", active: show === "risk", count: atRisk },
        ]}
      />
      <SectionCard title={show === "risk" ? "At risk" : show === "active" ? "Active clients" : "All clients"}>
        <DataTable
          label="Clients"
          empty={<CardNote>No clients match this filter.</CardNote>}
          columns={[
            { key: "client", label: "Client" },
            { key: "plan", label: "Plan" },
            { key: "health", label: "Health" },
            { key: "lead", label: "Account lead" },
            { key: "renews", label: "Renews" },
            { key: "active", label: "Active" },
            { key: "status", label: "Status" },
          ]}
          rows={visible.map((c) => {
            const h = health.get(c.id)!;
            const status = h.atRisk && c.status === "ACTIVE" ? { label: "At risk", tone: "turn" as PillTone } : (STATUS[c.status] ?? STATUS.ACTIVE);
            return {
              id: c.id,
              href: `/ops/clients/${c.id}/dashboard`,
              cells: {
                client: <span className="text-[15px]">{c.name}</span>,
                plan: PLAN_TIER_LABEL[c.planTier] ?? c.planTier,
                health: (
                  <span title={h.reasons.length ? h.reasons.join(" · ") : "Nothing at risk"}>
                    <HealthDot score={h.score} />
                  </span>
                ),
                lead: c.accountLead ? (
                  shortName(c.accountLead.user.name)
                ) : (
                  <span className="text-brand-ink-2">Not set</span>
                ),
                renews: c.renewalDate ? formatDate(c.renewalDate, { day: "numeric", month: "short" }) : <span className="text-brand-ink-2">Not set</span>,
                active: c.projects.length,
                status: <StatusPill tone={status.tone}>{status.label}</StatusPill>,
              },
            };
          })}
        />
      </SectionCard>
    </OpsPage>
  );
}
