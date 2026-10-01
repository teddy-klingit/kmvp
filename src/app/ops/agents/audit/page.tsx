import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { NavTabs } from "@/components/ui/nav-tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { overrideAgentRunAction } from "@/lib/actions/ops-agent-actions";

export default async function AgentAuditLogPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  const { projectId } = await searchParams;

  const [runs, project] = await Promise.all([
    prisma.agentRun.findMany({
      where: projectId ? { projectId } : undefined,
      include: { agent: true, client: true, project: true, overriddenByUser: true, requestedByUser: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    projectId ? prisma.project.findUnique({ where: { id: projectId } }) : Promise.resolve(null),
  ]);

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader title="Agents" addHref="/ops/agents" />
        <NavTabs items={[{ label: "Library", href: "/ops/agents" }, { label: "Decision log", href: "/ops/agents/audit" }]} />

        {projectId && (
          <Card className="flex items-center justify-between gap-4 bg-info-soft p-4">
            <p className="text-sm text-ink">
              Filtered to <strong>{project?.name ?? "this project"}</strong> only.
            </p>
            <a href="/ops/agents/audit" className="text-xs font-medium text-primary hover:underline">
              Clear filter
            </a>
          </Card>
        )}

        <Card className="divide-y divide-border p-0">
          {runs.length === 0 && <p className="px-5 py-4 text-sm text-muted-foreground">No agent runs recorded{projectId ? " for this project" : ""} yet.</p>}
          {runs.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 px-5 py-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">
                  {r.agent.name} · {r.client?.name}
                  {r.project && ` · ${r.project.name}`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(r.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <p className="text-sm text-muted-foreground">{r.decision ?? "No decision recorded."}</p>
              {r.requestedByUser && <p className="text-xs text-muted-foreground">Requested by {r.requestedByUser.name} (self-service)</p>}
              <div className="flex items-center gap-2">
                <Badge tone={r.status === "SUCCESS" ? "success" : r.status === "FLAGGED" ? "warning" : "danger"}>{r.status}</Badge>
                {r.overridden ? (
                  <Badge tone="warning">Overridden by {r.overriddenByUser?.name ?? "staff"} — {r.overrideReason}</Badge>
                ) : (
                  <form action={overrideAgentRunAction} className="flex flex-1 gap-2">
                    <input type="hidden" name="runId" value={r.id} />
                    <Textarea name="reason" placeholder="Override this decision — why?" className="h-8 min-h-0 py-1.5 text-xs" />
                    <Button type="submit" size="sm" variant="secondary">
                      Override
                    </Button>
                  </form>
                )}
              </div>
            </div>
          ))}
        </Card>
      </div>
    </OpsPage>
  );
}
