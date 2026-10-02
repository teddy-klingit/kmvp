"use client";

import { useState } from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Bot, ChartColumn, Coins, Eye, Gauge, Globe, Heart, MessageSquare, MousePointer2, Percent, Search, Sparkles, Table2, Users, Wallet, X, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sparkline } from "@/components/insights/charts";

/** The README's icon per metric, each on its own pale tile. */
const ICONS = {
  spend: { icon: Wallet, bg: "bg-brand-lime-pale" },
  impressions: { icon: Eye, bg: "bg-brand-lavender-pale" },
  clicks: { icon: MousePointer2, bg: "bg-brand-pink-pale" },
  ctr: { icon: Percent, bg: "bg-brand-peach-pale" },
  cpc: { icon: Coins, bg: "bg-brand-tag-grey" },
  followers: { icon: Users, bg: "bg-brand-lavender-pale" },
  engagement: { icon: Heart, bg: "bg-brand-pink-pale" },
  comments: { icon: MessageSquare, bg: "bg-brand-peach-pale" },
  visits: { icon: Globe, bg: "bg-brand-lime-pale" },
  ai: { icon: Sparkles, bg: "bg-brand-pink-pale" },
  seo: { icon: Search, bg: "bg-brand-lime-pale" },
  crawlers: { icon: Bot, bg: "bg-brand-lavender-pale" },
  speed: { icon: Zap, bg: "bg-brand-peach-pale" },
  score: { icon: Gauge, bg: "bg-brand-tag-grey" },
} satisfies Record<string, { icon: LucideIcon; bg: string }>;

export type IconKind = keyof typeof ICONS;

export function IconTile({ kind }: { kind: IconKind }) {
  const { icon: Icon, bg } = ICONS[kind];
  return (
    <span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-[8px]", bg)}>
      <Icon className="size-4 text-brand-ink" strokeWidth={1.75} />
    </span>
  );
}

/** A number first: icon, label, the value, one line of context, a sparkline. A delta only with a real previous period. */
export function StatTile({ icon, label, value, context, spark, delta }: { icon: IconKind; label: string; value: string; context?: string | null; spark?: number[]; delta?: { text: string; tone: "good" | "bad" | "neutral" } | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl bg-white p-5">
      <span className="flex items-center gap-2.5 text-[14px] text-brand-ink-2">
        <IconTile kind={icon} />
        <span className="truncate">{label}</span>
      </span>
      <span className="flex flex-wrap items-baseline gap-2">
        <span className="whitespace-nowrap text-[24px] font-semibold leading-[1.15] tabular-nums min-[480px]:text-[30px]">{value}</span>
        {delta && <span className={cn("text-[13px]", delta.tone === "bad" ? "text-brand-orange-text" : "text-brand-ink-2")}>{delta.text}</span>}
      </span>
      {context && <span className="truncate text-[13px] text-brand-mute">{context}</span>}
      {spark && spark.length > 1 && <Sparkline values={spark} />}
    </div>
  );
}

export type TableData = { columns: string[]; rows: (string | number)[][] };

/** One chart per question: the title is the question, and every chart can be read as a table. */
export function ChartCard({ title, subtitle, meta, action, table, children, className, flush = false, id }: { title: string; subtitle?: string | null; meta?: React.ReactNode; action?: React.ReactNode; table?: TableData; children: React.ReactNode; className?: string; /** Rows that run edge to edge (lists, tables): no body padding. */ flush?: boolean; id?: string }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section id={id} aria-label={title} className={cn("flex min-w-0 scroll-mt-6 flex-col rounded-2xl bg-white", className)}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-brand-line px-6 py-[18px]">
        <h2 className="m-0 flex-1 text-[19px] font-normal">{title}</h2>
        {meta}
        {table && table.rows.length > 0 && (
          <button
            type="button"
            onClick={() => setAsTable((t) => !t)}
            aria-pressed={asTable}
            aria-label={asTable ? "View as chart" : "View as table"}
            title={asTable ? "View as chart" : "View as table"}
            className={cn("-my-1 flex size-8 shrink-0 items-center justify-center rounded-full text-brand-ink-2 hover:bg-brand-chip hover:text-brand-ink", asTable && "bg-brand-chip text-brand-ink")}
          >
            {asTable ? <ChartColumn className="size-4" strokeWidth={1.75} /> : <Table2 className="size-4" strokeWidth={1.75} />}
          </button>
        )}
        {action}
      </header>
      <div className={cn("flex flex-col", flush ? "" : "gap-3 px-6 pb-6 pt-5")}>
        {subtitle && <span className={cn("text-[14px] text-brand-ink-2", flush ? "px-6 pt-4" : "-mt-1")}>{subtitle}</span>}
        {asTable && table ? <div className={flush ? "px-6 py-4" : ""}><DataTableView table={table} /></div> : children}
      </div>
    </section>
  );
}

function DataTableView({ table }: { table: TableData }) {
  return (
    <div className="max-h-[360px] overflow-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            {table.columns.map((c, i) => (
              <th key={c} className={cn("border-b border-brand-line py-2 font-normal text-brand-mute", i ? "text-right" : "text-left")}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>
              {r.map((v, j) => (
                <td key={j} className={cn("border-b border-brand-line py-1.5 tabular-nums", j ? "text-right" : "text-left")}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Not connected or no data yet: the chart's shape in grey, one line and one button. Never a text-only card. */
export function SkeletonChart({ shape = "bars", line, action }: { shape?: "bars" | "line" | "matrix"; line: string; action?: React.ReactNode }) {
  const bars = [22, 34, 28, 46, 40, 56, 50, 64];
  return (
    <div className="flex flex-col gap-4">
      <div aria-hidden className="flex h-[88px] items-end gap-2">
        {shape === "line" ? (
          <svg viewBox="0 0 300 80" className="h-full w-full" preserveAspectRatio="none">
            <polyline points="0,62 40,58 80,60 120,48 160,50 200,36 240,40 300,24" fill="none" stroke="#E6E0D2" strokeWidth={3} />
          </svg>
        ) : shape === "matrix" ? (
          <div className="grid h-full w-full grid-cols-5 gap-2">
            {Array.from({ length: 15 }, (_, i) => (
              <span key={i} className="rounded-[6px] bg-brand-nav" />
            ))}
          </div>
        ) : (
          bars.map((h, i) => <span key={i} className="flex-1 rounded-t-[4px] bg-brand-nav" style={{ height: `${h + 20}%` }} />)
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[14px] text-brand-ink-2">{line}</span>
        {action}
      </div>
    </div>
  );
}

/** "Why?": the agent's full reasoning, in a side sheet. The page itself never shows a paragraph. */
export function WhySheet({ title, reasoning, label = "Why?" }: { title: string; reasoning: string; label?: string }) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <button type="button" className="text-[13px] text-brand-ink-2 underline underline-offset-2 hover:text-brand-ink">
          {label}
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-[440px] max-w-[92vw] flex-col gap-4 overflow-y-auto bg-white p-7 font-brand shadow-xl outline-none">
          <div className="flex items-start gap-3">
            <DialogPrimitive.Title className="m-0 flex-1 text-[19px] font-normal">{title}</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Close" className="flex size-9 items-center justify-center rounded-full text-brand-ink-2 hover:bg-brand-chip">
              <X className="size-4" strokeWidth={1.75} />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="m-0 whitespace-pre-wrap text-[15px] leading-[1.6] text-brand-ink-2">{reasoning}</DialogPrimitive.Description>
          <span className="text-[12px] text-brand-mute">The agent&apos;s reasoning, from the numbers on this page.</span>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** A takeaway: tag, big number, a short headline, its mini chart, one action, and "Why?". */
export function Takeaway({ tag, number, headline, chart, action, why, primary }: { tag: string; number: string | null; headline: string; chart: React.ReactNode; action: { label: string; href: string } | null; why: string | null; primary?: boolean }) {
  return (
    <article className="flex min-w-0 flex-col gap-4 rounded-2xl bg-white p-6">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-brand-chip px-2.5 py-1 text-[13px] text-brand-ink-2">{tag}</span>
        <span className="flex-1" />
        {why && <WhySheet title={headline} reasoning={why} />}
      </div>
      <div className="flex flex-col gap-1">
        {number && <span className="text-[34px] font-semibold leading-[1.1] tabular-nums">{number}</span>}
        <span className="text-[16px]">{headline}</span>
      </div>
      <div className="flex-1">{chart}</div>
      {action && (
        <Link href={action.href} className={cn("inline-flex h-10 items-center self-start rounded-full px-[18px] font-brand-mono text-[12px] no-underline", primary ? "bg-brand-ink text-white hover:bg-black" : "border border-brand-outline text-brand-ink hover:border-brand-ink")}>
          {action.label}
        </Link>
      )}
    </article>
  );
}
