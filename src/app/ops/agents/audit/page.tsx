import { requireOpsPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { AgentsHeader } from "@/components/ops/agents-header";
import { FilterChips } from "@/components/ds/filter-chips";
import { SectionCard, CardNote } from "@/components/ds/card";
import { DataTable } from "@/components/ds/data-table";
import { StatusPill } from "@/components/ds/status-pill";
import { pillClass } from "@/components/ds/button";
import { roleTierFor } from "@/lib/role-tier";
import { formatDate } from "@/lib/utils";
import { overrideAgentRunAction } from "@/lib/actions/ops-agent-actions";
import Link from "next/link";

const EDIT_FOR_AGENT: Record<string, "brief" | "estimate" | "staffing"> = { brief_agent: "brief", estimate_agent: "estimate", staffing_agent: "staffing" };

/** Ops → Agents → Decision log (OpsClients pattern): every agent run, newest first, with overrides. */
export default async function AgentAuditLogPage({ searchParams }: { searchParams: Promise<{ projectId?: string; show?: string }> }) {
  const viewer = await requireOpsPage(["ADMIN", "PM"]);
  const { projectId, show } = await searchParams;

  const [runs, project] = await Promise.all([
    prisma.agentRun.findMany({
      where: {
        ...(projectId ? { projectId } : {}),
        ...(show === "flagged" ? { status: { in: ["FLAGGED", "FAILED"] } } : show === "overridden" ? { overridden: true } : {}),
      },
      include: { agent: true, client: true, project: true, overriddenByUser: true, requestedByUser: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    projectId ? prisma.project.findUnique({ where: { id: projectId } }) : Promise.resolve(null),
  ]);

  const qs = (o: { show?: string }) => {
    const q = new URLSearchParams();
    if (projectId) q.set("projectId", projectId);
    if (o.show) q.set("show", o.show);
    return `/ops/agents/audit${q.size ? `?${q}` : ""}`;
  };
  return (
    <OpsPage>
      <AgentsHeader admin={roleTierFor(viewer.title) === "ADMIN"} eyebrow={projectId ? `Decision log · ${project?.name ?? "one project"}` : `Decision log · last ${runs.length} runs`} />
      <div className="flex flex-wrap items-center gap-3">
        <FilterChips
          label="Filter runs"
          items={[
            { label: "All", href: qs({}), active: !show },
            { label: "Flagged or failed", href: qs({ show: "flagged" }), active: show === "flagged" },
            { label: "Overridden", href: qs({ show: "overridden" }), active: show === "overridden" },
          ]}
        />
        {projectId && (
          <Link href="/ops/agents/audit" className="font-brand-mono text-[12px] text-brand-ink underline underline-offset-4">
            CLEAR PROJECT FILTER
          </Link>
        )}
      </div>
      <SectionCard title="Decisions">
        <DataTable
          label="Agent decisions"
          empty={<CardNote>No agent runs recorded{projectId ? " for this project" : ""} yet.</CardNote>}
          columns={[
            { key: "when", label: "When", className: "w-[120px]" },
            { key: "agent", label: "Agent" },
            { key: "decision", label: "Decision" },
            { key: "status", label: "Status" },
            { key: "action", label: "", className: "w-[260px]" },
          ]}
          rows={runs.map((r) => ({
            id: r.id,
            cells: {
              when: <span className="whitespace-nowrap font-brand-mono text-[11px] text-brand-ink-2">{formatDate(r.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).toUpperCase()}</span>,
              agent: (
                <span className="flex flex-col">
                  <span className="text-[15px]">{r.agent.name}</span>
                  <span className="text-[12px] text-brand-ink-2">
                    {[r.client?.name, r.project?.name].filter(Boolean).join(" · ")}
                    {r.requestedByUser ? ` · self-service by ${r.requestedByUser.name}` : ""}
                  </span>
                </span>
              ),
              decision: <span className="text-[13px] leading-[1.5] text-brand-ink-2">{r.decision ?? "No decision recorded."}</span>,
              status: (
                <span className="flex flex-col items-start gap-1">
                  <StatusPill tone={r.status === "SUCCESS" ? "success" : r.status === "FLAGGED" ? "watch" : "danger"}>{r.status === "SUCCESS" ? "Done" : r.status === "FLAGGED" ? "Flagged" : "Failed"}</StatusPill>
                  {r.overridden && <StatusPill tone="watch">Overridden</StatusPill>}
                </span>
              ),
              action: r.overridden ? (
                <span className="text-[12px] text-brand-ink-2">
                  {r.overriddenByUser?.name ?? "Staff"}: {r.overrideReason}
                </span>
              ) : r.projectId && EDIT_FOR_AGENT[r.agent.key] ? (
                // Overriding these agents means changing what they decided: that happens in the cockpit,
                // where the edit changes the data and marks this run overridden with the PM's reason.
                <Link href={`/ops/projects/${r.projectId}?edit=${EDIT_FOR_AGENT[r.agent.key]}#${EDIT_FOR_AGENT[r.agent.key]}`} className="text-[13px] text-brand-ink underline underline-offset-4">
                  Change it in the cockpit
                </Link>
              ) : (
                <form action={overrideAgentRunAction} className="flex gap-2">
                  <input type="hidden" name="runId" value={r.id} />
                  <input name="reason" placeholder="Override: why?" aria-label="Override reason" className="h-9 min-w-0 flex-1 rounded-full border border-brand-outline bg-white px-3 text-[13px] outline-none focus:border-brand-ink" />
                  <button type="submit" className={pillClass("secondary", "sm")}>
                    Override
                  </button>
                </form>
              ),
            },
          }))}
        />
      </SectionCard>
    </OpsPage>
  );
}
