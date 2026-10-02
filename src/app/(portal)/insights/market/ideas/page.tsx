import { X } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { jsonArray } from "@/lib/utils";
import { estimatePreview, type PriceEntry } from "@/lib/brief-studio/formats";
import { updateIdeaStatusAction, startBriefFromIdeaAction, generateMarketIntelligenceAction } from "@/lib/actions/market-intelligence-actions";
import { pillClass } from "@/components/ds/button";
import { AgentButton } from "@/components/portal/insights/agent-button";
import { ChartCard, SkeletonChart, WhySheet } from "@/components/insights/cards";
import { MiniBars } from "@/components/insights/charts";

const BANDS = ["bg-brand-pink-pale", "bg-brand-lime-pale", "bg-brand-peach-pale"];
const SHOWN = 3;
const firstSentence = (s: string) => s.split(/(?<=[.!?])\s/)[0];

/**
 * Market → Ideas (InsightsIdeas.dc.html): three idea cards, each opening with a mini chart of its evidence, a
 * one-line why, evidence chips, a credit estimate from the Price List and "Brief this". The agent's longer
 * reasoning is behind "Why?". Ideas written before v2 have no chart, so they show without one.
 */
export default async function MarketIdeasPage() {
  const viewer = await getPortalViewer();
  const [ideas, priceItems] = await Promise.all([
    prisma.marketIntelligenceIdea.findMany({ where: { clientId: viewer.clientId, status: { in: ["NEW", "SAVED"] } }, orderBy: { createdAt: "desc" } }),
    prisma.priceListItem.findMany({ where: { archivedAt: null } }),
  ]);
  const prices: PriceEntry[] = priceItems.map((p) => ({ deliverableType: p.deliverableType, complexityTier: p.complexityTier, creditCost: p.creditCost, leadTimeDays: p.leadTimeDays }));
  const shown = ideas.slice(0, SHOWN);
  const earlier = ideas.slice(SHOWN);

  if (ideas.length === 0) {
    return (
      <ChartCard title="Ideas worth briefing">
        <SkeletonChart line="The market agent turns signals and your best formats into three ideas, each with its evidence." action={<AgentButton action={generateMarketIntelligenceAction} label="Generate ideas" pendingLabel="Reading…" />} />
      </ChartCard>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-[22px] font-normal">
          {shown.length} idea{shown.length === 1 ? "" : "s"} from the market agent
        </h2>
        <span className="flex items-center gap-4">
          <span className="hidden text-[14px] text-brand-mute min-[700px]:inline">Each idea shows the data behind it</span>
          <AgentButton action={generateMarketIntelligenceAction} label="Generate more" pendingLabel="Reading…" />
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-3">
        {shown.map((idea, i) => {
          const chart = jsonArray<{ label: string; value: number; display: string }>(idea.chart);
          const evidence = jsonArray<{ label: string }>(idea.evidence);
          const formats = jsonArray<string>(idea.formats);
          const estimate = formats.length ? estimatePreview({ formats, ideasCount: 1 }, prices) : null;
          const why = idea.why ?? firstSentence(idea.detail);
          return (
            <article key={idea.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl bg-white">
              {chart.length >= 2 && (
                <div className={`px-6 py-5 ${BANDS[i % BANDS.length]}`}>
                  <MiniBars rows={chart.map((c, j) => ({ label: c.label, value: c.value, display: c.display, tone: j === 0 ? "ink" : "grey" }))} />
                </div>
              )}
              <div className="flex flex-1 flex-col gap-3 px-6 py-5">
                <div className="flex items-start gap-2">
                  <h3 className="m-0 flex-1 text-[19px] font-normal leading-[1.3]">{idea.title}</h3>
                  <form action={updateIdeaStatusAction}>
                    <input type="hidden" name="id" value={idea.id} />
                    <input type="hidden" name="status" value="DISMISSED" />
                    <button type="submit" aria-label={`Dismiss ${idea.title}`} className="flex size-9 items-center justify-center rounded-full text-brand-mute hover:bg-brand-chip hover:text-brand-ink">
                      <X className="size-4" />
                    </button>
                  </form>
                </div>
                <p className="m-0 text-[14px] leading-[1.5] text-brand-ink-2">{why}</p>
                {evidence.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {evidence.map((e) => (
                      <span key={e.label} className="rounded-full bg-brand-chip px-2.5 py-1 text-[13px] text-brand-ink-2">
                        {e.label}
                      </span>
                    ))}
                  </div>
                )}
                <span className="flex-1" />
                <div className="flex items-center gap-3 pt-2">
                  <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                    {estimate && <span className="text-[13px] tabular-nums text-brand-mute">≈ {estimate.low === estimate.high ? estimate.low : `${estimate.low}–${estimate.high}`} credits</span>}
                    {idea.detail !== why && <WhySheet title={idea.title} reasoning={idea.detail} />}
                  </span>
                  <form action={startBriefFromIdeaAction}>
                    <input type="hidden" name="id" value={idea.id} />
                    <input type="hidden" name="title" value={idea.title} />
                    <input type="hidden" name="detail" value={why} />
                    <button type="submit" className={pillClass("primary", "sm")}>
                      Brief this
                    </button>
                  </form>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {earlier.length > 0 && (
        <details className="rounded-2xl bg-white">
          <summary className="cursor-pointer list-none px-6 py-4 font-brand-mono text-[12px] text-brand-ink">{earlier.length} EARLIER IDEA{earlier.length === 1 ? "" : "S"}</summary>
          <ul className="m-0 list-none p-0">
            {earlier.map((idea) => (
              <li key={idea.id} className="flex items-center gap-3 border-t border-brand-line px-6 py-3.5">
                <span className="min-w-0 flex-1 truncate text-[15px]">{idea.title}</span>
                <form action={startBriefFromIdeaAction}>
                  <input type="hidden" name="id" value={idea.id} />
                  <input type="hidden" name="title" value={idea.title} />
                  <input type="hidden" name="detail" value={idea.why ?? firstSentence(idea.detail)} />
                  <button type="submit" className={pillClass("secondary", "sm")}>
                    Brief this
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
