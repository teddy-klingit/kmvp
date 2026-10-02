import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CardRows } from "@/components/ds/card";
import { cn } from "@/lib/utils";

/** The brand & message platform sections with a done / not-written dot. With `current`, the section page's side list (current in bold). */
export function PlatformList({ sections, drafted, current }: { sections: { slug: string; label: string; done: boolean }[]; drafted: Set<string>; current?: string }) {
  return (
    <CardRows>
      {sections.map((s) => (
        <li key={s.slug}>
          <Link
            href={`/assets/brand-platform/${s.slug}`}
            aria-current={s.slug === current ? "page" : undefined}
            className="flex min-h-11 items-center gap-3 px-6 py-4 text-brand-ink no-underline hover:bg-brand-chip"
          >
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", s.done ? "bg-brand-lime-strong" : "bg-brand-outline")} />
            <span className={cn("min-w-0 flex-1 truncate text-[16px]", s.slug === current && "font-semibold")}>{s.label}</span>
            {current === undefined && (
              <span className="text-[14px] text-brand-ink-2">{s.done ? <span className="text-brand-ink">Done</span> : drafted.has(s.slug) ? "Draft ready" : "Not written yet"}</span>
            )}
            {current === undefined && <ArrowRight className="size-4 shrink-0 text-brand-ink" strokeWidth={1.75} />}
          </Link>
        </li>
      ))}
    </CardRows>
  );
}
