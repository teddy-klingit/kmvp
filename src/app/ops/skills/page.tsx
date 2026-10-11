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

const KIND: Record<string, string> = { SKILL: "Skill", ASSISTANT: "Assistant", INTERNAL: "Klingit automation" };

/**
 * Ops → Skills & AI → Catalog: every skill (standard and clients' custom ones), assistant and internal automation,
 * its status and how its runs went. Skills and assistants charge the client's AI credits; automation never does.
 */
export default async function SkillsCatalogPage({ searchParams }: { searchParams: Promise<{ show?: string; kind?: string }> }) {
  await requireOpsPage(["ADMIN"]);
  const { show, kind } = await searchParams;
  const agents = await prisma.agent.findMany({ include: { runs: { select: { status: true } }, client: { select: { name: true } } }, orderBy: [{ kind: "asc" }, { name: "asc" }] });
  const count = (s: string) => agents.filter((a) => a.status === s).length;
  const visible = agents.filter((a) => (!show || a.status === show) && (!kind || a.kind === kind));
  return (
    <OpsPage>
      <AgentsHeader admin eyebrow={`${agents.filter((a) => a.kind === "SKILL").length} skills · ${agents.filter((a) => a.kind === "ASSISTANT").length} assistants · ${count("LIVE")} live`} />
      <FilterChips
        label="Filter the catalog"
        items={[
          { label: "All", href: "/ops/skills", active: !show && !kind },
          ...(["SKILL", "ASSISTANT", "INTERNAL"] as const).map((k) => ({ label: `${KIND[k]}s`, href: `/ops/skills?kind=${k}`, active: kind === k, count: agents.filter((a) => a.kind === k).length })),
          ...(["LIVE", "SANDBOX", "DISABLED"] as const).map((s) => ({ label: STATUS[s].label, href: `/ops/skills?show=${s}`, active: show === s, count: count(s) })),
        ]}
      />
      <SectionCard title="Catalog">
        <DataTable
          label="Skills and AI"
          empty={<CardNote>Nothing matches this filter.</CardNote>}
          columns={[
            { key: "agent", label: "Name" },
            { key: "category", label: "Kind" },
            { key: "status", label: "Status" },
            { key: "runs", label: "Runs", align: "right" },
            { key: "flagged", label: "Flagged", align: "right" },
            { key: "version", label: "Version" },
          ]}
          rows={visible.map((a) => {
            const flagged = a.runs.filter((r) => r.status === "FLAGGED" || r.status === "FAILED").length;
            return {
              id: a.id,
              href: `/ops/skills/${a.id}`,
              cells: {
                agent: (
                  <span className="flex flex-col">
                    <span className="flex items-center gap-2 text-[15px]">
                      {a.name}
                      {a.clientId ? <StatusPill>Custom · {a.client?.name}</StatusPill> : a.selfService ? <StatusPill>Client-run</StatusPill> : null}
                    </span>
                    <span className="text-[12px] text-brand-ink-2">{a.description}</span>
                  </span>
                ),
                category: a.kind === "INTERNAL" ? `${KIND[a.kind]} · ${AGENT_CATEGORY_LABEL[a.category]}` : `${KIND[a.kind]}${a.skillCategory ? ` · ${a.skillCategory}` : ""}`,
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
