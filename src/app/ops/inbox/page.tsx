import { requireOpsPage } from "@/lib/authz";
import { formatDate } from "@/lib/utils";
import { loadInbox } from "@/lib/ops-inbox";
import { loadOpsProjects, rankExceptions } from "@/lib/ops-exceptions";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { SectionCard, CardNote } from "@/components/ds/card";
import { DataTable } from "@/components/ds/data-table";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { NeedsYouChips } from "@/components/ops/needs-you-chips";

const URGENCY: Record<string, { label: string; tone: PillTone }> = { high: { label: "High", tone: "danger" }, medium: { label: "Medium", tone: "watch" }, low: { label: "Low", tone: "neutral" } };

/** Ops → Needs you → Inbox (OpsClients pattern): flagged agent runs and attention items across clients. */
export default async function OpsInboxPage() {
  await requireOpsPage(["ADMIN", "PM"]);
  const [{ attention, flaggedRuns, count }, projects] = await Promise.all([loadInbox(), loadOpsProjects()]);
  const rows = [
    ...flaggedRuns.map((r) => ({
      id: `run-${r.id}`,
      href: r.project ? `/ops/projects/${r.project.id}?feed=activity` : `/ops/agents/${r.agentId}`,
      cells: {
        item: (
          <span className="flex flex-col">
            <span className="text-[15px]">
              {r.agent.name} {r.status === "FAILED" ? "failed" : "flagged something"}
            </span>
            <span className="text-[12px] text-brand-ink-2">{r.decision ?? "No detail recorded."}</span>
          </span>
        ),
        where: [r.client?.name, r.project?.name].filter(Boolean).join(" · "),
        when: <span className="font-brand-mono text-[11px] text-brand-ink-2">{formatDate(r.createdAt, { day: "2-digit", month: "short" }).toUpperCase()}</span>,
        urgency: <StatusPill tone={r.status === "FAILED" ? "danger" : "watch"}>{r.status === "FAILED" ? "Failed" : "Flagged"}</StatusPill>,
      },
    })),
    ...attention.map((a) => ({
      id: a.id,
      href: a.href,
      cells: {
        item: (
          <span className="flex flex-col">
            <span className="text-[15px]">{a.title}</span>
            <span className="text-[12px] text-brand-ink-2">{a.detail}</span>
          </span>
        ),
        where: `${a.clientName} · ${a.projectName}`,
        when: null,
        urgency: <StatusPill tone={URGENCY[a.urgency].tone}>{URGENCY[a.urgency].label}</StatusPill>,
      },
    })),
  ];
  return (
    <OpsPage>
      <PageHeader eyebrow={`Inbox · ${count} item${count === 1 ? "" : "s"}`} title="Needs you" />
      <NeedsYouChips active="inbox" needs={rankExceptions(projects).length} inbox={count} />
      <SectionCard title="Inbox">
        <DataTable
          label="Inbox"
          empty={<CardNote>Inbox zero. Nothing needs your attention.</CardNote>}
          columns={[
            { key: "item", label: "Item" },
            { key: "where", label: "Client · project" },
            { key: "when", label: "When" },
            { key: "urgency", label: "Urgency" },
          ]}
          rows={rows}
        />
      </SectionCard>
    </OpsPage>
  );
}
