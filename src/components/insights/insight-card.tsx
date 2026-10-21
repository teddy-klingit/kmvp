import Link from "next/link";
import { ChevronRight, Crosshair } from "lucide-react";
import type { Insight } from "@/generated/prisma";
import { insightChart, insightSources } from "@/lib/insight-records";
import { Chips } from "@/components/insights/source-chip";
import { cn } from "@/lib/utils";

/** A finding's mini chart: its bars to one scale, the one that matters in purple. */
export function MiniBars({ insight, className }: { insight: Pick<Insight, "chart">; className?: string }) {
  const chart = insightChart(insight);
  if (!chart) return null;
  const max = Math.max(...chart.bars.map((b) => b.value), 0) || 1;
  return (
    <span aria-hidden className={cn("flex h-11 shrink-0 items-end gap-1", className)}>
      {chart.bars.map((b) => (
        <span key={b.label} className={cn(chart.bars.length > 3 ? "w-[16px]" : "w-[44px]", "rounded-[2px]", b.highlight ? "bg-[#B455B6]" : "bg-[#E8E2D6]")} style={{ height: b.value ? `${Math.max(8, (b.value / max) * 100)}%` : "2px" }} title={`${b.label}: ${b.value}`} />
      ))}
    </span>
  );
}

/** Where a finding lives: its card on Insights Overview, or the Planner for plans and key moments. */
export const insightHref = (i: Pick<Insight, "id" | "kind">) => (i.kind === "plan" || i.kind === "moment" ? "/planner" : `/insights#finding-${i.id}`);

/**
 * One finding (Phase W): title, the number, the mini chart, what it compares over what period, its sources. On the
 * opportunity page it links to where it lives; on Insights Overview it shows the opportunities it's used in.
 */
export function InsightCard({ insight, used, ask, className, id }: { insight: Insight; used?: { id: string; title: string; done: boolean }[]; ask?: boolean; className?: string; id?: string }) {
  const line = [insight.comparison, insight.period, insight.dataSize].filter(Boolean).join(" · ");
  return (
    <article id={id} aria-label={insight.title} className={cn("flex min-w-0 flex-col gap-3 rounded-[12px] bg-white px-5 py-4", className)}>
      <span className="flex items-start gap-4">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[15px]">{insight.title}</span>
          <span className="text-[24px] font-light leading-tight tabular-nums">{insight.value}</span>
        </span>
        <MiniBars insight={insight} />
      </span>
      {line && <span className="text-[13px] leading-[1.45] text-brand-ink-2">{line}</span>}
      <span className={cn("flex flex-wrap items-center gap-2", used && "border-t border-brand-line pt-3")}>
        <span className="flex-1">
          <Chips sources={insightSources(insight)} />
        </span>
        {used === undefined ? (
          <Link href={insightHref(insight)} className="text-[12px] text-brand-ink underline underline-offset-4">
            {insight.kind === "plan" || insight.kind === "moment" ? "In Planner ›" : "In Insights ›"}
          </Link>
        ) : used.length ? (
          used.map((o) => (
            <Link key={o.id} href={`/opportunities/${o.id}`} className="inline-flex items-center gap-1.5 rounded-full border border-[#F5C9B0] bg-[#FFF4EE] px-3 py-1 text-[12px] text-brand-ink no-underline hover:border-brand-orange">
              <Crosshair className="size-3" strokeWidth={2} /> {o.title}
              {o.done ? " (done)" : ""} <ChevronRight className="size-3" />
            </Link>
          ))
        ) : (
          <span className="text-[12px] text-brand-ink-2">
            Not used in an opportunity yet
            {ask ? (
              <>
                {" "}
                <Link href={`/opportunities?ask=1&about=${insight.id}`} className="text-brand-ink underline underline-offset-4">
                  Ask for one
                </Link>
              </>
            ) : null}
          </span>
        )}
      </span>
    </article>
  );
}
