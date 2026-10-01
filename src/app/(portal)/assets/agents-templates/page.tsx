import Link from "next/link";
import { Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { requestAgentBuildAction } from "@/lib/actions/agent-request-actions";

const SUGGESTIONS = [
  { name: "Seasonal content agent", detail: "Learns from your Q1–Q4 patterns and proactively drafts seasonal project briefs 6 weeks ahead.", tag: "Save ~8h per project" },
  { name: "Influencer brief agent", detail: "Generates structured influencer briefs with your tone, dos/don'ts, and disclosure requirements.", tag: "New workflow" },
];

export default async function AgentsTemplatesPage() {
  const viewer = await getPortalViewer();
  const [runs, selfServiceAgents] = await Promise.all([
    prisma.agentRun.findMany({
      where: { clientId: viewer.clientId },
      include: { agent: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.agent.findMany({ where: { selfService: true, status: "LIVE" }, orderBy: { name: "asc" } }),
  ]);

  const byAgent = new Map<string, { agent: (typeof runs)[number]["agent"]; count: number; lastRun: Date }>();
  for (const r of runs) {
    const existing = byAgent.get(r.agentId);
    if (existing) {
      existing.count += 1;
      if (r.createdAt > existing.lastRun) existing.lastRun = r.createdAt;
    } else {
      byAgent.set(r.agentId, { agent: r.agent, count: 1, lastRun: r.createdAt });
    }
  }
  const agents = Array.from(byAgent.values());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-lg font-semibold">Use an agent yourself</h2>
          <p className="text-sm text-muted-foreground">These agents are ready for you to run directly — no account manager needed. Each one already knows your brand.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {selfServiceAgents.map((agent) => (
            <Link key={agent.id} href={`/assets/agents-templates/agent/${agent.id}`}>
              <Card className="flex h-full flex-col gap-3 p-4 transition-colors hover:border-ink/30">
                <div className="flex items-center justify-between">
                  <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-ink">
                    <Sparkles className="size-4" />
                  </span>
                  <Badge tone="accent">Self-service</Badge>
                </div>
                <div>
                  <p className="text-sm font-semibold">{agent.name}</p>
                  <p className="text-sm text-muted-foreground">{agent.description}</p>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Your agents ({agents.length})</h2>
          <p className="text-sm text-muted-foreground">Custom-built for your brand — each agent learns from your brand OS and past projects.</p>
        </div>
      </div>

      {agents.length === 0 ? (
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">No agent activity recorded for your account yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {agents.map(({ agent, count, lastRun }) => (
            <Link key={agent.id} href={`/assets/agents-templates/agent/${agent.id}`}>
              <Card className="flex h-full flex-col gap-3 p-4 transition-colors hover:border-ink/30">
                <div className="flex items-center justify-between">
                  <span className="flex size-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-ink">
                    {agent.name.slice(0, 2).toUpperCase()}
                  </span>
                  <Badge tone="success">Live</Badge>
                </div>
                <div>
                  <p className="text-sm font-semibold">{agent.name}</p>
                  <p className="text-sm text-muted-foreground">{agent.description}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Used {count}× · {formatDate(lastRun)}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl bg-fade-purple-green p-5">
        <SectionLabel>Klingit recommends</SectionLabel>
        <p className="-mt-2 text-sm text-ink">Based on your projects and brand, your account lead suggests building these next.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SUGGESTIONS.map((s) => (
            <Card key={s.name} className="flex flex-col gap-2 p-4">
              <p className="text-sm font-semibold">{s.name}</p>
              <p className="text-sm text-muted-foreground">{s.detail}</p>
              <div className="mt-1 flex items-center justify-between">
                <Badge tone="success">{s.tag}</Badge>
                <form action={requestAgentBuildAction}>
                  <input type="hidden" name="name" value={s.name} />
                  <Button type="submit" size="sm" variant="secondary">
                    Request build
                  </Button>
                </form>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
