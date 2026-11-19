import Link from "next/link";
import type { Balance, BalanceKey, MonthBar } from "@/lib/client-credits";
import { cn } from "@/lib/utils";

/** Phase T2: the parts the client page's tabs share (cards, the three balances, 6-month bars). */
export function OpsCard({ title, link, children, id, className }: { title: React.ReactNode; link?: { label: string; href: string }; children: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={cn("overflow-hidden rounded-[12px] bg-white", className)}>
      <header className="flex items-baseline gap-2 border-b border-brand-line px-6 py-4">
        <h2 className="m-0 flex-1 text-[18px] font-normal">{title}</h2>
        {link && (
          <Link href={link.href} className="font-brand-mono text-[12px] uppercase tracking-[0.04em] text-brand-ink underline underline-offset-4">
            {link.label}
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

export const STAFF_TAG = <span className="ml-2 font-brand-mono text-[11px] uppercase tracking-[0.06em] text-brand-orange-text">Staff only</span>;

export const BALANCE_COLOR: Record<BalanceKey, string> = { pm: "#5B6EB8", creative: "#1E1E1E", ai: "#B455B6" };
const HATCH = "repeating-linear-gradient(135deg, #E9E3D6 0 4px, #F6F2EA 4px 8px)";

/** One balance as a meter: "14 of 20 left", "10 from 1 Nov" (hatched), or "Not in their plan" (muted). */
export function BalanceMeter({ b, big = false }: { b: Balance; big?: boolean }) {
  const share = b.of > 0 ? Math.max(0, Math.min(100, (b.left / b.of) * 100)) : 0;
  const [num, ...rest] = b.headline.split(" ");
  return (
    <div className={cn("flex flex-col gap-1.5", b.state === "none" && "opacity-60")}>
      <span className="flex items-baseline gap-2">
        <span className="flex-1 text-[14px]">{b.label}</span>
        {b.state === "none" ? (
          <span className="text-[13px] text-brand-ink-2">{b.headline}</span>
        ) : (
          <>
            <span className={cn("font-light tabular-nums", big ? "text-[28px]" : "text-[22px]", b.warn && "text-brand-orange-text")}>{num}</span>
            <span className="text-[13px] text-brand-ink-2">{rest.join(" ")}</span>
          </>
        )}
      </span>
      <span className="block h-1.5 overflow-hidden rounded-full" style={{ background: b.state === "pending" ? HATCH : "#EFEBE2" }}>
        {b.state === "live" && <span className="block h-full rounded-full" style={{ width: `${share}%`, background: BALANCE_COLOR[b.key] }} />}
      </span>
      <span className={cn("text-[12px]", b.warn ? "text-brand-orange-text" : "text-brand-ink-2")}>{b.note}</span>
    </div>
  );
}

/** Six months of use as bars, the monthly grant as a dashed line, this month's forecast hatched above its bar. */
export function MonthBars({ bars, grant, color, unit = "" }: { bars: MonthBar[]; grant: number; color: string; unit?: string }) {
  const max = Math.max(grant, ...bars.map((b) => Math.max(b.used, b.forecast ?? 0)), 1) * 1.08;
  const h = 96;
  return (
    <div className="flex flex-col gap-1">
      {grant > 0 && <span className="text-[11px] text-brand-ink-2">{grant.toLocaleString("en-GB")}{unit} a month</span>}
      <div className="relative" style={{ height: h }}>
        {grant > 0 && <span aria-hidden className="absolute inset-x-0 border-t border-dashed border-brand-ink-2" style={{ bottom: `${(grant / max) * 100}%` }} />}
        <div className="absolute inset-0 grid grid-cols-6 items-end gap-3">
          {bars.map((b) => (
            <span key={b.key} className="relative flex h-full flex-col justify-end" title={`${b.label}: ${b.used.toLocaleString("en-GB")} used${b.forecast !== null ? ` · ${b.forecast.toLocaleString("en-GB")} forecast` : ""}`}>
              {b.forecast !== null && b.forecast > b.used && <span aria-hidden className="w-full rounded-t-[3px]" style={{ height: `${((b.forecast - b.used) / max) * 100}%`, background: HATCH }} />}
              <span aria-hidden className={cn("w-full", b.forecast !== null && b.forecast > b.used ? "" : "rounded-t-[3px]")} style={{ height: `${(b.used / max) * 100}%`, background: color, minHeight: b.used ? 2 : 0 }} />
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-6 gap-3 text-center text-[11px] text-brand-ink-2">
        {bars.map((b) => (
          <span key={b.key}>{b.label}</span>
        ))}
      </div>
    </div>
  );
}
