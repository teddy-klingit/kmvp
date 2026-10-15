import { FilterChips } from "@/components/ds/filter-chips";

/**
 * A tab's own line under the Admin header (Phase T): what it holds, its actions, and second-level views as chips
 * (never a second tab bar).
 */
export function AdminSection({ note, actions, chips, current }: { note: React.ReactNode; actions?: React.ReactNode; chips?: { label: string; href: string }[]; current?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex-1 text-[14px] text-brand-ink-2">{note}</span>
        {actions}
      </div>
      {chips && <FilterChips label="Sections" items={chips.map((c) => ({ ...c, active: c.href === current }))} />}
    </div>
  );
}
