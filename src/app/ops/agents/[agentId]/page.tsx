import { requireOpsPage } from "@/lib/authz";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { SectionCard, CardRows, CardNote } from "@/components/ds/card";
import { DataTable } from "@/components/ds/data-table";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { Button } from "@/components/ds/button";
import { formatDate } from "@/lib/utils";
import { AGENT_CATEGORY_LABEL } from "@/lib/labels";
import { updateAgentStatusAction, updateAgentSelfServiceAction } from "@/lib/actions/ops-agent-actions";

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  LIVE: { label: "Live", tone: "success" },
  SANDBOX: { label: "Sandbox", tone: "watch" },
  DISABLED: { label: "Disabled", tone: "neutral" },
  ERROR: { label: "Error", tone: "danger" },
};

export default async function AgentDetailPage({ params }: { params: Promise<{ agentId: string }> }) {
  await requireOpsPage(["ADMIN"]);
  const { agentId } = await params;
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      runs: { include: { project: true, client: true }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!agent) notFound();
  const status = STATUS[agent.status] ?? { label: agent.status, tone: "neutral" as PillTone };

  return (
    <OpsPage>
      <PageHeader
        back={{ href: "/ops/agents", label: "Agents" }}
        eyebrow={`${AGENT_CATEGORY_LABEL[agent.category]} · v${agent.version}`}
        title={agent.name}
        actions={
          <StatusPill tone={status.tone} dot>
            {status.label}
          </StatusPill>
        }
      />
      {agent.description && <p className="-mt-2 mb-0 max-w-[720px] text-[15px] leading-[1.5] text-brand-ink-2">{agent.description}</p>}

      <SectionCard title="Config & rollout">
        <CardRows>
          <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
            <div className="flex min-w-0 flex-1 basis-[260px] flex-col gap-0.5">
              <span className="text-[15px]">Status</span>
              <span className="text-[13px] leading-[1.5] text-brand-ink-2">Move to sandbox to test changes before they run against real client work.</span>
            </div>
            <form action={updateAgentStatusAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="agentId" value={agent.id} />
              {(["SANDBOX", "LIVE", "DISABLED"] as const).map((s) => (
                <Button key={s} type="submit" name="status" value={s} size="sm" variant={agent.status === s ? "primary" : "secondary"} aria-pressed={agent.status === s}>
                  {STATUS[s].label}
                </Button>
              ))}
            </form>
          </li>
          <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
            <div className="flex min-w-0 flex-1 basis-[260px] flex-col gap-0.5">
              <span className="text-[15px]">Self-service</span>
              <span className="text-[13px] leading-[1.5] text-brand-ink-2">
                Let clients run this agent themselves from Brand OS, without a Klingit account manager in the loop.
              </span>
            </div>
            <form action={updateAgentSelfServiceAction} className="flex gap-2">
              <input type="hidden" name="agentId" value={agent.id} />
              <Button type="submit" name="selfService" value="false" size="sm" variant={!agent.selfService ? "primary" : "secondary"} aria-pressed={!agent.selfService}>
                Off
              </Button>
              <Button type="submit" name="selfService" value="true" size="sm" variant={agent.selfService ? "primary" : "secondary"} aria-pressed={agent.selfService}>
                On
              </Button>
            </form>
          </li>
        </CardRows>
      </SectionCard>

      <SectionCard title="Run history" meta={agent.runs.length > 0 ? <span className="font-brand-mono text-[12px] text-brand-ink-2">LAST {agent.runs.length}</span> : undefined}>
        <DataTable
          label="Run history"
          empty={<CardNote>No runs recorded yet.</CardNote>}
          columns={[
            { key: "when", label: "When", className: "w-[120px]" },
            { key: "decision", label: "Decision" },
            { key: "status", label: "Status", className: "w-[140px]" },
          ]}
          rows={agent.runs.map((r) => {
            const where = [r.client?.name, r.project?.name].filter(Boolean).join(" · ");
            return {
              id: r.id,
              cells: {
                when: (
                  <span className="whitespace-nowrap font-brand-mono text-[11px] text-brand-ink-2">
                    {formatDate(r.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).toUpperCase()}
                  </span>
                ),
                decision: (
                  <span className="flex flex-col">
                    <span className="text-[14px] leading-[1.5]">{r.decision ?? "Run completed"}</span>
                    {where && <span className="text-[12px] text-brand-ink-2">{where}</span>}
                  </span>
                ),
                status: (
                  <span className="flex flex-col items-start gap-1">
                    <StatusPill tone={r.status === "SUCCESS" ? "success" : r.status === "FLAGGED" ? "watch" : "danger"}>
                      {r.status === "SUCCESS" ? "Done" : r.status === "FLAGGED" ? "Flagged" : "Failed"}
                    </StatusPill>
                    {r.overridden && <StatusPill tone="watch">Overridden</StatusPill>}
                  </span>
                ),
              },
            };
          })}
        />
      </SectionCard>
    </OpsPage>
  );
}
