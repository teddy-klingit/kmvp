import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { SectionCard, CardNote, CardRows } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { PageGrid } from "@/components/ds/page-grid";
import { pillClass } from "@/components/ds/button";
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
    <PageGrid
      main={
        <>
          {selfServiceAgents.length > 0 && (
            <SectionCard title="Use an agent yourself" action={<span className="font-brand-mono text-[12px] text-brand-ink-2">{selfServiceAgents.length} READY</span>}>
              <p className="m-0 px-6 pt-4 text-[13px] leading-[1.5] text-brand-ink-2">Run these directly, no account manager needed. Each one already knows your brand.</p>
              <CardRows className="pt-1">
                {selfServiceAgents.map((agent) => (
                  <li key={agent.id}>
                    <Link href={`/assets/agents-templates/agent/${agent.id}`} className="flex items-center gap-3 px-6 py-4 text-brand-ink no-underline transition-colors hover:bg-brand-chip">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-lime text-brand-ink">
                        <Sparkles className="size-4" strokeWidth={1.75} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[15px]">{agent.name}</span>
                        {agent.description && <span className="text-[13px] leading-[1.5] text-brand-ink-2">{agent.description}</span>}
                      </span>
                      <StatusPill>Self-service</StatusPill>
                      <ChevronRight className="size-4 shrink-0 text-brand-ink-2" strokeWidth={1.75} />
                    </Link>
                  </li>
                ))}
              </CardRows>
            </SectionCard>
          )}

          <SectionCard title="Your agents" meta={agents.length > 0 ? <span className="font-brand-mono text-[12px] text-brand-ink-2">{agents.length}</span> : undefined}>
            {agents.length === 0 ? (
              <CardNote>No agent activity recorded for your account yet.</CardNote>
            ) : (
              <>
                <p className="m-0 px-6 pt-4 text-[13px] leading-[1.5] text-brand-ink-2">Custom-built for your brand. Each agent learns from your Brand OS and past projects.</p>
                <CardRows className="pt-1">
                  {agents.map(({ agent, count, lastRun }) => (
                    <li key={agent.id}>
                      <Link href={`/assets/agents-templates/agent/${agent.id}`} className="flex items-center gap-3 px-6 py-4 text-brand-ink no-underline transition-colors hover:bg-brand-chip">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-chip font-brand-mono text-[11px] text-brand-ink">
                          {agent.name.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="text-[15px]">{agent.name}</span>
                          {agent.description && <span className="text-[13px] leading-[1.5] text-brand-ink-2">{agent.description}</span>}
                          <span className="font-brand-mono text-[11px] text-brand-ink-2">
                            USED {count}× · {formatDate(lastRun).toUpperCase()}
                          </span>
                        </span>
                        <StatusPill tone="success">Live</StatusPill>
                        <ChevronRight className="size-4 shrink-0 text-brand-ink-2" strokeWidth={1.75} />
                      </Link>
                    </li>
                  ))}
                </CardRows>
              </>
            )}
          </SectionCard>
        </>
      }
      side={
        <SectionCard title="Klingit recommends">
          <p className="m-0 px-6 pt-4 text-[13px] leading-[1.5] text-brand-ink-2">Based on your projects and brand, your account lead suggests building these next.</p>
          <CardRows className="pt-1">
            {SUGGESTIONS.map((s) => (
              <li key={s.name} className="flex flex-col gap-2 px-6 py-4">
                <span className="text-[15px] text-brand-ink">{s.name}</span>
                <span className="text-[13px] leading-[1.5] text-brand-ink-2">{s.detail}</span>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <StatusPill tone="success">{s.tag}</StatusPill>
                  <form action={requestAgentBuildAction}>
                    <input type="hidden" name="name" value={s.name} />
                    <button type="submit" className={pillClass("secondary", "sm")}>
                      Request build
                    </button>
                  </form>
                </div>
              </li>
            ))}
          </CardRows>
        </SectionCard>
      }
    />
  );
}
