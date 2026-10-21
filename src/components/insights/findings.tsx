import Link from "next/link";
import { Crosshair } from "lucide-react";
import type { recentFindings } from "@/lib/insight-records";
import { InsightCard } from "@/components/insights/insight-card";

type Findings = Awaited<ReturnType<typeof recentFindings>>;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Insights Overview (Phase W, design InsightsLinked): the bridge line to Opportunities, then "What we found this
 * month" as cards, each with its sources and the opportunities it's used in (or "Not used yet · Ask for one").
 */
export function Findings({ data }: { data: Findings }) {
  if (!data.findings.length) return null;
  const { feeding, open, unused } = data.bridge;
  return (
    <>
      <p className="m-0 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[12px] bg-[#FFF8F2] px-5 py-4 text-[14px]">
        <Crosshair aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="min-w-0 flex-1 basis-[280px]">
          {feeding ? (
            <>
              {feeding} of these findings feed <b className="font-semibold">{plural(open, "open opportunity", "open opportunities")}</b>.
            </>
          ) : (
            "None of these findings feeds an open opportunity yet."
          )}
          {unused ? ` ${plural(unused, "finding isn't", "findings aren't")} used yet: we keep watching ${unused === 1 ? "it" : "them"}.` : ""}
        </span>
        <Link href="/opportunities" className="inline-flex h-9 items-center rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white no-underline">
          Open Opportunities
        </Link>
      </p>
      <section aria-labelledby="found" className="flex flex-col gap-3">
        <h2 id="found" className="m-0 flex flex-wrap items-baseline gap-x-3 text-[20px] font-normal">
          What we found this month <span className="text-[13px] text-brand-ink-2">Each finding shows its sources, and which opportunity it&apos;s used in</span>
        </h2>
        <div className="grid grid-cols-1 gap-4 min-[900px]:grid-cols-2">
          {data.findings.map((f) => (
            <InsightCard key={f.insight.id} id={`finding-${f.insight.id}`} insight={f.insight} used={f.used} ask className="scroll-mt-6 target:ring-2 target:ring-brand-ink" />
          ))}
        </div>
        {data.total > data.findings.length && <p className="m-0 text-[13px] text-brand-ink-2">and {plural(data.total - data.findings.length, "earlier finding", "earlier findings")} this month.</p>}
      </section>
    </>
  );
}
