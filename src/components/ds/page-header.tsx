import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { SegmentedNav, type SegmentLink } from "@/components/ds/segmented-control";
import { cn } from "@/lib/utils";

/**
 * The page header on every page: mono eyebrow, 36px weight-300 title, actions on the right, and
 * optionally the page's one SegmentedNav underneath. A second level of navigation is FilterChips,
 * never a second tab bar.
 */
export function PageHeader({
  title,
  eyebrow,
  actions,
  tabs,
  tabsLabel,
  back,
  className,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: SegmentLink[];
  tabsLabel?: string;
  /** Breadcrumb back link ("‹ Brand IQ · Platform"). */
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <header className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {back && (
            <Link href={back.href} className="-ml-1 inline-flex min-h-11 items-center gap-1 self-start text-[13px] text-brand-ink-2 no-underline hover:text-brand-ink sm:min-h-0">
              <ChevronLeft className="size-4" strokeWidth={1.75} />
              {back.label}
            </Link>
          )}
          {eyebrow && <span className="font-brand-mono text-[12px] uppercase text-brand-ink-2">{eyebrow}</span>}
          <h1 className="m-0 text-[30px] font-light leading-[1.15] tracking-[0.01em] text-brand-ink min-[700px]:text-[36px]">{title}</h1>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {tabs && <SegmentedNav items={tabs} label={tabsLabel ?? "Sections"} />}
    </div>
  );
}
