import { ArrowRight, Bookmark, X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { updateIdeaStatusAction, startBriefFromIdeaAction, generateMarketIntelligenceAction } from "@/lib/actions/market-intelligence-actions";
import { SectionCard, CardRows } from "@/components/ds/card";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { EmptyState } from "@/components/ds/empty-state";
import { pillClass } from "@/components/ds/button";
import { AgentButton } from "@/components/portal/insights/agent-button";

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  NEW: { label: "New", tone: "neutral" },
  SAVED: { label: "Saved", tone: "success" },
  BRIEFED: { label: "Briefed", tone: "success" },
};

/** Market → Ideas: every idea the agent surfaced, kept until the client acts on it. */
export default async function MarketIdeasPage() {
  const viewer = await getPortalViewer();
  const [ideas, dismissed] = await Promise.all([
    prisma.marketIntelligenceIdea.findMany({ where: { clientId: viewer.clientId, status: { not: "DISMISSED" } }, orderBy: { createdAt: "desc" } }),
    prisma.marketIntelligenceIdea.count({ where: { clientId: viewer.clientId, status: "DISMISSED" } }),
  ]);
  const generate = <AgentButton action={generateMarketIntelligenceAction} label="Generate more ideas" pendingLabel="Reading…" align="start" />;

  if (ideas.length === 0) return <EmptyState title="No ideas yet. Generate an analysis to get a few concrete ones." action={generate} />;

  return (
    <SectionCard title="Ideas worth briefing" action={<AgentButton action={generateMarketIntelligenceAction} label="Generate more" pendingLabel="Reading…" />}>
      <CardRows>
        {ideas.map((idea) => {
          const status = STATUS[idea.status] ?? STATUS.NEW;
          return (
            <li key={idea.id} className="flex flex-col gap-3 px-6 py-5">
              <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                <span className="min-w-0 flex-1 text-[17px] leading-[1.45]">{idea.title}</span>
                <StatusPill tone={status.tone}>{status.label}</StatusPill>
              </div>
              <p className="m-0 text-[14px] leading-[1.55] text-brand-ink-2">{idea.detail}</p>
              <div className="flex flex-wrap items-center gap-2">
                <form action={startBriefFromIdeaAction}>
                  <input type="hidden" name="id" value={idea.id} />
                  <input type="hidden" name="title" value={idea.title} />
                  <input type="hidden" name="detail" value={idea.detail} />
                  <button type="submit" className={pillClass("primary", "sm")}>
                    Start a brief <ArrowRight className="size-3.5" />
                  </button>
                </form>
                {idea.status !== "SAVED" && (
                  <form action={updateIdeaStatusAction}>
                    <input type="hidden" name="id" value={idea.id} />
                    <input type="hidden" name="status" value="SAVED" />
                    <button type="submit" className={pillClass("secondary", "sm")}>
                      <Bookmark className="size-3.5" /> Save
                    </button>
                  </form>
                )}
                <form action={updateIdeaStatusAction}>
                  <input type="hidden" name="id" value={idea.id} />
                  <input type="hidden" name="status" value="DISMISSED" />
                  <button type="submit" className={pillClass("secondary", "sm")}>
                    <X className="size-3.5" /> Dismiss
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </CardRows>
      {dismissed > 0 && (
        <p className="m-0 border-t border-brand-line px-6 py-3 text-[12px] text-brand-ink-2">
          {dismissed} dismissed idea{dismissed === 1 ? "" : "s"} hidden.
        </p>
      )}
    </SectionCard>
  );
}
