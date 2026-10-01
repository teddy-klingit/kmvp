import { ArrowRight, Bookmark, X, Lightbulb } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GenerateMarketIntelligenceButton } from "@/components/portal/generate-market-intelligence-button";
import { updateIdeaStatusAction, startBriefFromIdeaAction } from "@/lib/actions/market-intelligence-actions";

const STATUS_LABEL: Record<string, { label: string; tone: "neutral" | "success" | "info" }> = {
  NEW: { label: "New", tone: "info" },
  SAVED: { label: "Saved", tone: "success" },
  BRIEFED: { label: "Briefed", tone: "success" },
  DISMISSED: { label: "Dismissed", tone: "neutral" },
};

export default async function MarketIntelligenceIdeasPage() {
  const viewer = await getPortalViewer();
  const ideas = await prisma.marketIntelligenceIdea.findMany({
    where: { clientId: viewer.clientId, status: { not: "DISMISSED" } },
    orderBy: { createdAt: "desc" },
  });
  const dismissedCount = await prisma.marketIntelligenceIdea.count({ where: { clientId: viewer.clientId, status: "DISMISSED" } });

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Ideas worth briefing</h2>
          <p className="text-sm text-muted-foreground">Every idea the agent has surfaced, kept until you act on it.</p>
        </div>
        <GenerateMarketIntelligenceButton label="Generate more ideas" />
      </div>

      {ideas.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-muted-foreground">No ideas yet — generate an analysis to get a few concrete ones to start from.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {ideas.map((idea) => {
            const status = STATUS_LABEL[idea.status] ?? STATUS_LABEL.NEW;
            return (
              <Card key={idea.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-ink">
                      <Lightbulb className="size-3.5" />
                    </span>
                    <p className="text-sm font-medium">{idea.title}</p>
                  </div>
                  <Badge tone={status.tone} className="shrink-0">
                    {status.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{idea.detail}</p>
                <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
                  <form action={startBriefFromIdeaAction}>
                    <input type="hidden" name="id" value={idea.id} />
                    <input type="hidden" name="title" value={idea.title} />
                    <input type="hidden" name="detail" value={idea.detail} />
                    <button type="submit" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                      Start a brief <ArrowRight className="size-3" />
                    </button>
                  </form>
                  {idea.status !== "SAVED" && (
                    <form action={updateIdeaStatusAction}>
                      <input type="hidden" name="id" value={idea.id} />
                      <input type="hidden" name="status" value="SAVED" />
                      <button type="submit" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                        <Bookmark className="size-3" /> Save
                      </button>
                    </form>
                  )}
                  <form action={updateIdeaStatusAction}>
                    <input type="hidden" name="id" value={idea.id} />
                    <input type="hidden" name="status" value="DISMISSED" />
                    <button type="submit" className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
                      <X className="size-3" /> Dismiss
                    </button>
                  </form>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {dismissedCount > 0 && <p className="text-xs text-muted-foreground">{dismissedCount} dismissed idea{dismissedCount === 1 ? "" : "s"} hidden.</p>}
    </>
  );
}
