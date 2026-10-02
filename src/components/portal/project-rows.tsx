import Link from "next/link";
import { Lock } from "lucide-react";
import { AvatarStack } from "@/components/ds/avatar";
import { StatusDot } from "@/components/ds/status-dot";
import type { ProjectRowData } from "@/lib/client-home";
import { cn } from "@/lib/utils";

/**
 * Project rows (Home "Your projects" and the Projects list view): name + type, a status dot in plain
 * words, the stage bar with "REVIEW · 4 OF 5", and the team. Names never wrap. Rows stack on narrow cards.
 * Must sit inside a `@container/col`.
 */
export function ProjectRows({ rows, menu }: { rows: ProjectRowData[]; menu?: (row: ProjectRowData) => React.ReactNode }) {
  return (
    <ul className="m-0 list-none p-0">
      {rows.map((p) => (
        <li key={p.id} className="relative flex items-center border-t border-brand-line first:border-t-0 hover:bg-brand-chip">
          <Link
            href={p.href}
            className={cn(
              "grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-3 px-6 py-[18px] text-brand-ink no-underline @min-[600px]/col:grid-cols-[minmax(0,1.6fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_80px]",
              menu && "pr-14"
            )}
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-1.5">
                {p.confidential && <Lock aria-label="Confidential" className="size-3.5 shrink-0 text-brand-ink-2" />}
                <span className="truncate text-[16px]">{p.name}</span>
              </span>
              <span className="truncate text-[13px] text-brand-ink-2">{p.draft ? `${p.meta} · draft` : p.meta}</span>
            </span>
            <span className="order-2 col-span-2 @min-[600px]/col:order-none @min-[600px]/col:col-span-1">
              <StatusDot tone={p.status.tone}>{p.status.label}</StatusDot>
            </span>
            <span className="order-3 col-span-2 flex flex-col gap-1.5 @min-[600px]/col:order-none @min-[600px]/col:col-span-1">
              <span className="block h-1 overflow-hidden rounded-full bg-brand-track">
                <span className="block h-full rounded-full bg-brand-ink" style={{ width: `${(p.step / 5) * 100}%` }} />
              </span>
              <span className="whitespace-nowrap font-brand-mono text-[11px] text-brand-ink-2">
                {p.stage.toUpperCase()} · {p.step} OF 5
              </span>
            </span>
            <span className="flex justify-end">{p.team.length > 0 && <AvatarStack names={p.team} size={24} max={3} overlap={4} />}</span>
          </Link>
          {menu && <span className="absolute right-3 top-1/2 -translate-y-1/2">{menu(p)}</span>}
        </li>
      ))}
    </ul>
  );
}
