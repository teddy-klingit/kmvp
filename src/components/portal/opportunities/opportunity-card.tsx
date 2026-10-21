import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { Opportunity } from "@/generated/prisma";
import { CONFIDENCE_LABEL, type Combined, type Confidence } from "@/lib/combined";
import { KINDS, STATUS_LABEL, type Status } from "@/lib/opportunities";
import type { OppView } from "@/lib/opportunity-view";
import { insightSources } from "@/lib/insight-records";
import { addCombinedToPlanAction } from "@/lib/actions/opportunity-actions";
import { Chips } from "@/components/insights/source-chip";
import { Avatar } from "@/components/ds/avatar";
import { cn } from "@/lib/utils";

export const wday = (d: Date) => new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
export const CONFIDENCE_PILL: Record<Confidence, string> = { high: "bg-[#E4F2B3] text-[#5E6B2A]", medium: "bg-[#FDF3D8] text-[#8A6A12]", low: "bg-brand-chip text-brand-ink-2" };
const button = "inline-flex h-9 items-center rounded-full border px-4 font-brand-mono text-[12px] no-underline";

export function ConfidencePill({ confidence }: { confidence: Confidence | null }) {
  return <span className={cn("inline-flex self-start rounded-full px-3 py-1 text-[12px]", confidence ? CONFIDENCE_PILL[confidence] : "bg-brand-chip text-brand-ink-2")}>{confidence ? CONFIDENCE_LABEL[confidence] : "Not enough data yet"}</span>;
}

/** The PM's note: their words, their name. */
export function PmNote({ note, by }: { note: string; by: string | null }) {
  return (
    <p className="m-0 flex items-start gap-3 rounded-[10px] bg-brand-page px-4 py-3 text-[13px] leading-[1.5]">
      <Avatar name={by ?? "Klingit"} size={22} className="mt-0.5 shrink-0" />
      <span>
        “{note}” <span className="text-brand-ink-2">· {by ? `${by.split(" ")[0]}, your Marketing PM` : "your Marketing PM"}</span>
      </span>
    </p>
  );
}

/**
 * One opportunity on the Opportunities page (design Opps): rank, kind, the action and one line why; the insights it's
 * built from with their sources; the PM's note; then confidence, expected effect, cost and decide-by, and See why /
 * Add to Planner. A missing source shows its warning here, and the confidence is already one step lower.
 */
export function OpportunityCard({ o, v, rank, pmNoteBy }: { o: Opportunity; v: OppView; rank: number; pmNoteBy: string | null }) {
  const combined = o.combined as unknown as Combined | null;
  const open = o.status === "new" || o.status === "considering";
  return (
    <article aria-labelledby={`opp-${o.id}`} className="grid grid-cols-1 gap-6 rounded-[12px] bg-white px-6 py-6 min-[1100px]:grid-cols-[32px_minmax(0,1.15fr)_minmax(0,1fr)_250px] min-[1100px]:px-8">
      <span className="text-[28px] font-light leading-none text-brand-ink-2" aria-hidden>
        {rank}
      </span>
      <div className="flex min-w-0 flex-col gap-3">
        <span className="font-brand-mono text-[11px] uppercase tracking-[0.06em] text-brand-ink-2">
          {KINDS[v.kind]}
          {v.tag ? ` · ${v.tag}` : ""}
        </span>
        <h2 id={`opp-${o.id}`} className="m-0 text-[22px] font-normal leading-[1.25] [text-wrap:balance]">
          <Link href={`/opportunities/${o.id}`} className="text-brand-ink no-underline hover:underline">
            {o.title}
          </Link>
        </h2>
        <p className="m-0 max-w-[60ch] text-[14px] leading-[1.55] text-brand-ink-2">{o.summary}</p>
        {o.pmNote && <PmNote note={o.pmNote} by={pmNoteBy} />}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-[12px] text-brand-ink-2">
          Built from {v.insights.length} insight{v.insights.length === 1 ? "" : "s"}
        </span>
        <ul className="m-0 flex list-none flex-col p-0">
          {v.insights.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-brand-line py-2 text-[13px]">
              <span className="flex min-w-0 flex-1 basis-[180px] items-start gap-2">
                <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-brand-ink" />
                <span>
                  {i.title}
                  {i.kind !== "moment" ? <span className="text-brand-ink-2"> · {i.value}</span> : null}
                </span>
              </span>
              <Chips sources={insightSources(i)} />
            </li>
          ))}
        </ul>
        {v.warning && (
          <p className="m-0 flex items-start gap-2 text-[12px] leading-[1.45] text-[#B42318]">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" strokeWidth={2} /> {v.warning}
          </p>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <ConfidencePill confidence={v.confidence} />
        <dl className="m-0 flex flex-col gap-3">
          {[
            { k: "Expected", v: v.estimate.text },
            { k: "Cost", v: v.cost ?? "No cost yet" },
            { k: "Decide by", v: v.decideBy ? wday(v.decideBy) : "Any time" },
          ].map((x) => (
            <div key={x.k} className="flex flex-col gap-0.5">
              <dt className="text-[12px] text-brand-ink-2">{x.k}</dt>
              <dd className="m-0 text-[15px]">{x.v}</dd>
            </div>
          ))}
        </dl>
        <span className="flex flex-wrap gap-2">
          <Link href={`/opportunities/${o.id}`} className={cn(button, "border-brand-ink bg-brand-ink text-white")}>
            See why
          </Link>
          {open ? (
            combined?.actions.addToPlan ? (
              <form action={addCombinedToPlanAction}>
                <input type="hidden" name="id" value={o.id} />
                <button type="submit" className={cn(button, "border-[#CFC8B8] bg-white text-brand-ink")}>
                  Add to Planner
                </button>
              </form>
            ) : (
              <Link href={`/opportunities/${o.id}#add`} className={cn(button, "border-[#CFC8B8] bg-white text-brand-ink")}>
                Add to Planner
              </Link>
            )
          ) : (
            <span className="inline-flex h-9 items-center text-[13px] text-brand-ink-2">{STATUS_LABEL[o.status as Status] ?? o.status}</span>
          )}
        </span>
      </div>
    </article>
  );
}

/** Beat or met (green), missed (pink): never orange, which means it's your turn. */
export function OutcomePill({ outcome }: { outcome: "beat" | "met" | "missed" | "measured" }) {
  const tone = outcome === "missed" ? "bg-[#FBE3E8] text-[#A33B57]" : outcome === "measured" ? "bg-brand-chip text-brand-ink-2" : "bg-[#E4F2B3] text-[#5E6B2A]";
  return <span className={cn("inline-flex self-start justify-self-start rounded-full px-2.5 py-0.5 text-[12px]", tone)}>{{ beat: "Beat", met: "Met", missed: "Missed", measured: "Measured" }[outcome]}</span>;
}
