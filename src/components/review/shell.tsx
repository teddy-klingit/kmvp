import Link from "next/link";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One full-screen review shell for every format (Review*.dc.html): a top bar (back link, title, format · count ·
 * version, the quality-checked chip, the mode switch, close), the work in the middle on #F2EDE3, and a 420px right
 * panel (comments, suggestions) whose footer holds Request changes and the one orange Approve.
 */
export type ShellHeader = {
  back: { href: string; label: string };
  title: string;
  subtitle: string;
  chip?: React.ReactNode;
  modes?: { label: string; href: string; active: boolean }[];
  /** The other formats in this project's review (ad set, copy, …). */
  formats?: { label: string; href: string; active: boolean }[];
  close: string;
};

export function ReviewShell({
  back,
  title,
  subtitle,
  chip,
  modes,
  formats,
  close,
  main,
  panel,
  footer,
}: {
  back: { href: string; label: string };
  title: string;
  subtitle: string;
  chip?: React.ReactNode;
  modes?: { label: string; href: string; active: boolean }[];
  formats?: { label: string; href: string; active: boolean }[];
  close: string;
  main: React.ReactNode;
  panel: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div data-fullscreen className="fixed inset-0 z-40 flex flex-col bg-white font-brand text-brand-ink">
      <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-brand-line px-5 py-3.5 min-[900px]:px-8">
        <Link href={back.href} className="hidden truncate text-[15px] text-brand-ink-2 no-underline hover:text-brand-ink min-[900px]:inline">
          ‹ {back.label}
        </Link>
        <span aria-hidden className="hidden h-8 w-px bg-brand-line min-[900px]:block" />
        <span className="flex min-w-[180px] flex-1 flex-col">
          <h1 className="m-0 truncate text-[19px] font-normal">{title}</h1>
          <span className="truncate text-[13px] text-brand-mute">{subtitle}</span>
        </span>
        {formats && formats.length > 1 && (
          <nav aria-label="Format" className="flex flex-wrap gap-2">
            {formats.map((f) => (
              <Link key={f.label} href={f.href} scroll={false} aria-current={f.active ? "page" : undefined} className={cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[14px] no-underline", f.active ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline bg-white text-brand-ink hover:border-brand-ink")}>
                {f.label}
              </Link>
            ))}
          </nav>
        )}
        {chip}
        {modes && modes.length > 1 && (
          <nav aria-label="View" className="flex gap-1 rounded-full bg-[var(--seg-track)] p-1">
            {modes.map((m) => (
              <Link
                key={m.label}
                href={m.href}
                scroll={false}
                aria-current={m.active ? "page" : undefined}
                className={cn("inline-flex h-9 items-center rounded-full px-4 text-[14px] no-underline", m.active ? "bg-brand-ink text-white" : "text-brand-ink hover:bg-black/5")}
              >
                {m.label}
              </Link>
            ))}
          </nav>
        )}
        <Link href={close} aria-label="Close review" className="flex size-10 items-center justify-center rounded-full bg-brand-chip text-brand-ink hover:bg-brand-line">
          <X className="size-4" strokeWidth={2} />
        </Link>
      </header>
      <div data-scroll className="flex min-h-0 flex-1 flex-col overflow-y-auto min-[1000px]:flex-row min-[1000px]:overflow-hidden">
        <main data-scroll className="shrink-0 bg-[#F2EDE3] min-[1000px]:min-h-0 min-[1000px]:flex-1 min-[1000px]:shrink min-[1000px]:overflow-auto">
          {main}
        </main>
        <aside data-scroll className="flex w-full shrink-0 flex-col border-t border-brand-line bg-white min-[1000px]:w-[420px] min-[1000px]:border-l min-[1000px]:border-t-0">
          <div className="flex min-h-0 flex-1 flex-col min-[1000px]:overflow-y-auto">{panel}</div>
          {footer && <footer className="flex flex-col gap-3 border-t border-brand-line px-6 py-5">{footer}</footer>}
        </aside>
      </div>
    </div>
  );
}
