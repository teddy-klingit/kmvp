import { requireOpsPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { AGENT_CATEGORY_LABEL } from "@/lib/labels";
import { OpsPage } from "@/components/ops/ops-page";
import { AgentsHeader } from "@/components/ops/agents-header";
import { FilterChips } from "@/components/ds/filter-chips";
import { SectionCard, CardNote } from "@/components/ds/card";
import { DataTable } from "@/components/ds/data-table";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  LIVE: { label: "Live", tone: "success" },
  SANDBOX: { label: "Sandbox", tone: "watch" },
  DISABLED: { label: "Disabled", tone: "neutral" },
  ERROR: { label: "Error", tone: "danger" },
};

/** Ops → Agents → Library (OpsClients pattern): every agent, its status and how its runs went. */
export default async function AgentsLibraryPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireOpsPage(["ADMIN"]);
  const { show } = await searchParams;
  const agents = await prisma.agent.findMany({ include: { runs: { select: { status: true } } }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  const count = (s: string) => agents.filter((a) => a.status === s).length;
  const visible = show ? agents.filter((a) => a.status === show) : agents;
  return (
    <OpsPage>
      <AgentsHeader admin eyebrow={`${agents.length} agents · ${count("LIVE")} live`} />
      <FilterChips
        label="Filter agents"
        items={[
          { label: "All", href: "/ops/agents", active: !show },
          ...(["LIVE", "SANDBOX", "DISABLED"] as const).map((s) => ({ label: STATUS[s].label, href: `/ops/agents?show=${s}`, active: show === s, count: count(s) })),
        ]}
      />
      <SectionCard title="Library">
        <DataTable
          label="Agents"
          empty={<CardNote>No agents match this filter.</CardNote>}
          columns={[
            { key: "agent", label: "Agent" },
            { key: "category", label: "Category" },
            { key: "status", label: "Status" },
            { key: "runs", label: "Runs", align: "right" },
            { key: "flagged", label: "Flagged", align: "right" },
            { key: "version", label: "Version" },
          ]}
          rows={visible.map((a) => {
            const flagged = a.runs.filter((r) => r.status === "FLAGGED" || r.status === "FAILED").length;
            return {
              id: a.id,
              href: `/ops/agents/${a.id}`,
              cells: {
                agent: (
                  <span className="flex flex-col">
                    <span className="flex items-center gap-2 text-[15px]">
                      {a.name}
                      {a.selfService && <StatusPill>Self-service</StatusPill>}
                    </span>
                    <span className="text-[12px] text-brand-ink-2">{a.description}</span>
                  </span>
                ),
                category: AGENT_CATEGORY_LABEL[a.category],
                status: <StatusPill tone={STATUS[a.status]?.tone}>{STATUS[a.status]?.label ?? a.status}</StatusPill>,
                runs: a.runs.length,
                flagged: flagged ? <span className="text-ds-danger-text">{flagged}</span> : 0,
                version: <span className="font-brand-mono text-[12px] text-brand-ink-2">{a.version}</span>,
              },
            };
          })}
        />
      </SectionCard>
    </OpsPage>
  );
}
