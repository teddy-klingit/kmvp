"use client";

import { cn } from "@/lib/utils";

export type SegmentOption<T extends string> = { value: T; label: string; icon?: React.ReactNode; badge?: number };

/** Two-to-three way switch on a #F1F2F4 track; the active segment is a white raised tile. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="grid rounded-[8px] bg-ds-subtle p-[3px]"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-11 items-center sm:h-8 justify-center gap-1.5 rounded-[6px] text-[13px] transition-colors",
              on ? "bg-white font-semibold text-ds-text shadow-[0_1px_2px_rgba(16,24,40,0.08)]" : "font-medium text-ds-text-2 hover:text-ds-text"
            )}
          >
            {o.icon}
            {o.label}
            {o.badge ? (
              <span
                aria-label={`${o.badge} unread`}
                className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-ds-turn px-[5px] text-[11px] font-semibold text-white"
              >
                {o.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
