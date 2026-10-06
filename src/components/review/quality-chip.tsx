import { Check } from "lucide-react";

/**
 * "Quality checked by Klingit · N checks" (the client's review screens and the QC "View as client"): a read-only
 * list of what was checked, every line passed. Flags, scores and reasons for accepted flags are never shown.
 */
export function QualityChip({ total, items }: { total: number; items: { label: string; source: string; count: number }[] }) {
  if (total === 0) return null;
  return (
    <details className="group relative">
      <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-full bg-brand-lime-pale px-4 text-[14px] text-brand-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="flex size-5 items-center justify-center rounded-full bg-[#8D9E47]">
          <Check className="size-3 text-white" strokeWidth={3} />
        </span>
        Quality checked by Klingit · {total} check{total === 1 ? "" : "s"}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-[320px] max-w-[85vw] rounded-2xl border border-brand-line bg-white p-5 shadow-lg">
        <p className="m-0 pb-3 text-[13px] leading-[1.5] text-brand-ink-2">Klingit checks every version against your Brand OS and the platform specs before you see it.</p>
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {items.map((i) => (
            <li key={i.label} className="flex items-start gap-2.5">
              <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#8D9E47]">
                <Check className="size-3 text-white" strokeWidth={3} />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-[14px]">{i.label}</span>
                <span className="text-[12px] text-brand-mute">
                  {i.source} · {i.count} asset{i.count === 1 ? "" : "s"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
