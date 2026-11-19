"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Check, Link2, Printer } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SEGMENTS, tabFor } from "@/lib/insights/tabs";
import { cn } from "@/lib/utils";

const PERIODS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "12 months" },
];

/** The period for the whole tab, in the URL (?range=30|90|365, 30 by default). */
export function PeriodSwitch({ medium = false }: { medium?: boolean }) {
  const pathname = usePathname() ?? "/insights";
  const params = useSearchParams();
  const current = params?.get("range") ?? "30";
  return (
    <nav aria-label="Period" className="flex w-max shrink-0 gap-1 rounded-full bg-[var(--seg-track)] p-1 print:hidden">
      {PERIODS.map((p) => {
        const q = new URLSearchParams(params?.toString() ?? "");
        if (p.value === "30") q.delete("range");
        else q.set("range", p.value);
        const on = current === p.value;
        return (
          <Link
            key={p.value}
            href={`${pathname}${q.size ? `?${q}` : ""}`}
            scroll={false}
            aria-current={on ? "page" : undefined}
            className={cn("inline-flex h-11 items-center whitespace-nowrap rounded-full px-[18px] text-[14px] no-underline transition-colors sm:h-10", on ? "bg-[var(--seg-active)] text-white" : "text-[var(--seg-text)] hover:bg-black/5", on && medium && "font-fw-medium")}
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * "Share as report": the tab as it is now (same period) for anyone on the client's account, by link, or printed
 * to PDF. The print view hides the menus and controls (print: variants).
 */
export function ShareReport({ medium = false }: { medium?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", window.location.href);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={cn("text-[14px] text-brand-ink underline underline-offset-4 hover:text-brand-ink-2 print:hidden", medium && "font-fw-medium")}>
          Share as report
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[280px]">
        <DropdownMenuLabel className="text-[13px] font-normal text-brand-ink-2">This tab and period, as a report. The link opens for anyone on your team.</DropdownMenuLabel>
        <DropdownMenuItem onSelect={(e) => { e.preventDefault(); void copy(); }}>
          {copied ? <Check className="size-4" strokeWidth={1.75} /> : <Link2 className="size-4" strokeWidth={1.75} />}
          {copied ? "Link copied" : "Copy link"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTimeout(() => window.print(), 50)}>
          <Printer className="size-4" strokeWidth={1.75} />
          Print or save as PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Above every tab: the block's crumb, the title, the question the tab answers, Ask, the period and Share. */
export function InsightsHeader({ ask }: { ask: React.ReactNode }) {
  const tab = tabFor(usePathname() ?? "/insights");
  const seg = tab.segment ? SEGMENTS[tab.segment] : null;
  // Three weights, as tokens: Medium for the title and the controls you act on.
  const weighted = true;
  return (
    <header className="flex flex-wrap items-start gap-x-6 gap-y-4">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {seg ? (
          <span className="flex w-max items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] text-brand-ink" style={{ background: seg.tint }}>
            <span aria-hidden className="size-2 rounded-[2px]" style={{ background: seg.bar }} />
            {seg.label}
          </span>
        ) : (
          <span className="font-brand-mono text-[12px] uppercase text-brand-ink-2">Insights</span>
        )}
        <h1 className={cn("m-0 text-[32px] leading-[1.15] tracking-[0.01em] min-[700px]:text-[36px]", weighted ? "font-fw-medium" : "font-light")}>{tab.label}</h1>
        <p className="m-0 text-[15px] text-brand-ink-2">{tab.question}</p>
      </div>
      <div className="flex w-full flex-col items-stretch gap-3 min-[1100px]:w-auto min-[1100px]:items-end">
        <div className={cn("print:hidden", weighted && "[&_button[type=submit]]:font-fw-medium")}>{ask}</div>
        <div className="flex flex-wrap items-center gap-4 min-[1100px]:justify-end">
          <PeriodSwitch medium={weighted} />
          <ShareReport medium={weighted} />
        </div>
      </div>
    </header>
  );
}
