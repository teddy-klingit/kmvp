import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { AGENT_CATEGORY_LABEL } from "@/lib/labels";
import { updateAgentStatusAction, updateAgentSelfServiceAction } from "@/lib/actions/ops-agent-actions";

const STATUS_TONE = { LIVE: "success", SANDBOX: "warning", DISABLED: "neutral", ERROR: "danger" } as const;

export default async function AgentDetailPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    include: {
      runs: { include: { project: true, client: true }, orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!agent) notFound();

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              {agent.name}
              <Badge tone={STATUS_TONE[agent.status]}>{agent.status}</Badge>
            </span>
          }
          actions={<div />}
        />
        <p className="-mt-4 text-sm text-muted-foreground">
          {AGENT_CATEGORY_LABEL[agent.category]} · v{agent.version} · {agent.description}
        </p>

        <div className="flex flex-col gap-3">
          <SectionLabel>Config &amp; rollout</SectionLabel>
          <Card className="flex items-center justify-between p-5">
            <p className="text-sm text-muted-foreground">
              Move to sandbox to test changes before they run against real client work.
            </p>
            <form action={updateAgentStatusAction} className="flex gap-2">
              <input type="hidden" name="agentId" value={agent.id} />
              {(["SANDBOX", "LIVE", "DISABLED"] as const).map((s) => (
                <Button key={s} type="submit" name="status" value={s} size="sm" variant={agent.status === s ? "primary" : "outline"}>
                  {s}
                </Button>
              ))}
            </form>
          </Card>
          <Card className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm font-medium">Self-service</p>
              <p className="text-sm text-muted-foreground">
                Let clients run this agent themselves from Brand IQ, without a Klingit account manager in the loop.
              </p>
            </div>
            <form action={updateAgentSelfServiceAction} className="flex gap-2">
              <input type="hidden" name="agentId" value={agent.id} />
              <Button type="submit" name="selfService" value="false" size="sm" variant={!agent.selfService ? "primary" : "outline"}>
                Off
              </Button>
              <Button type="submit" name="selfService" value="true" size="sm" variant={agent.selfService ? "primary" : "outline"}>
                On
              </Button>
            </form>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Run history</SectionLabel>
          <Card className="divide-y divide-border p-0">
            {agent.runs.length === 0 && <p className="px-5 py-4 text-sm text-muted-foreground">No runs recorded yet.</p>}
            {agent.runs.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium">{r.decision ?? "Run completed"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.client?.name}
                    {r.project && ` · ${r.project.name}`} · {formatDate(r.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {r.overridden && <Badge tone="warning">Overridden</Badge>}
                  <Badge tone={r.status === "SUCCESS" ? "success" : r.status === "FLAGGED" ? "warning" : "danger"}>{r.status}</Badge>
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </OpsPage>
  );
}
