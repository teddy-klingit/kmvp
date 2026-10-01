import { notFound } from "next/navigation";
import Link from "next/link";
import { Sparkles, Check } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/utils";
import { SelfServiceAgentForm } from "@/components/portal/self-service-agent-form";
import { SelfServiceOutput } from "@/components/portal/self-service-output";

export default async function ClientAgentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ agentId: string }>;
  searchParams: Promise<{ sent?: string }>;
}) {
  const { agentId } = await params;
  const { sent } = await searchParams;
  const viewer = await getPortalViewer();

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) notFound();

  const [runs, channels] = await Promise.all([
    prisma.agentRun.findMany({
      where: { agentId, clientId: viewer.clientId },
      include: { project: true, requestedByUser: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.connectedChannel.findMany({ where: { clientId: viewer.clientId }, orderBy: { connectedAt: "asc" } }),
  ]);

  const selfServeRuns = runs.filter((r) => r.requestedByUserId);
  const latestSelfServeRun = selfServeRuns[0];
  const pipelineRuns = agent.selfService ? runs.filter((r) => !r.requestedByUserId) : runs;

  return (
    <div className="flex flex-col gap-6">
      <Link href="/assets/agents-templates" className="text-sm text-primary hover:underline">
        &lt; All agents
      </Link>
      <div className="flex items-center gap-3">
        <div>
          <h1 className="font-display text-xl font-light">{agent.name}</h1>
          <p className="text-sm text-muted-foreground">{agent.description}</p>
        </div>
        {agent.selfService && (
          <Badge tone="accent" className="ml-auto shrink-0">
            <Sparkles className="size-3" /> Self-service
          </Badge>
        )}
      </div>

      {sent === "1" && (
        <Card className="flex items-center gap-2 border-l-4 border-l-success p-3 text-sm">
          <Check className="size-4 text-success-foreground" />
          Sent — your team will find it in the channel you picked.
        </Card>
      )}

      {agent.selfService && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Generate</SectionLabel>
          <Card className="flex flex-col gap-5 p-5">
            <SelfServiceAgentForm agentId={agent.id} agentKey={agent.key} />
            {latestSelfServeRun && (
              <div className="flex flex-col gap-2 border-t border-border pt-5">
                <p className="text-xs font-medium text-muted-foreground">
                  Latest generation · {formatDate(latestSelfServeRun.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
                <SelfServiceOutput agentId={agent.id} agentKey={agent.key} status={latestSelfServeRun.status} output={latestSelfServeRun.output} channels={channels} />
              </div>
            )}
          </Card>
        </div>
      )}

      {agent.selfService && selfServeRuns.length > 1 && (
        <div className="flex flex-col gap-3">
          <SectionLabel>Your past generations</SectionLabel>
          <Card className="divide-y divide-border p-0">
            {selfServeRuns.slice(1).map((r) => (
              <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
                <div>
                  <p className="text-sm font-medium">{r.decision ?? "Generation completed"}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.requestedByUser?.name ?? "You"} · {formatDate(r.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <Badge tone={r.status === "SUCCESS" ? "success" : r.status === "FLAGGED" ? "warning" : "danger"}>{r.status}</Badge>
              </div>
            ))}
          </Card>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <SectionLabel>Settings</SectionLabel>
        <Card className="flex flex-col gap-3 p-5">
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox defaultChecked />
            Notify me when this agent flags something for review
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <Checkbox defaultChecked />
            Include this agent&apos;s output in weekly reports
          </label>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <SectionLabel>{agent.selfService ? "Internal pipeline runs" : "Run history"}</SectionLabel>
        <Card className="divide-y divide-border p-0">
          {pipelineRuns.length === 0 && (
            <p className="px-5 py-4 text-sm text-muted-foreground">
              {agent.selfService ? "No internal project runs for your account yet." : "No runs yet."}
            </p>
          )}
          {pipelineRuns.map((r) => (
            <div key={r.id} className="flex items-center justify-between px-5 py-3.5">
              <div>
                <p className="text-sm font-medium">{r.decision ?? "Run completed"}</p>
                <p className="text-xs text-muted-foreground">
                  {r.project?.name} · {formatDate(r.createdAt, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              <Badge tone={r.status === "SUCCESS" ? "success" : r.status === "FLAGGED" ? "warning" : "danger"}>{r.status}</Badge>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
