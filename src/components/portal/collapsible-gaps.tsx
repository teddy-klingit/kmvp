"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function CollapsibleGaps({ gaps }: { gaps: string[] }) {
  const [open, setOpen] = useState(false);
  if (gaps.length === 0) return null;

  return (
    <div className="mt-3 flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 self-start rounded-full bg-warning-soft px-3 py-1.5 text-xs font-medium text-warning-foreground transition-colors hover:brightness-95"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        {gaps.length} thing{gaps.length === 1 ? "" : "s"} worth double-checking before production
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-warning-soft/60 p-3.5">
          {gaps.map((gap, i) => (
            <p
              key={i}
              className="animate-in fade-in slide-in-from-left-1 text-sm text-warning-foreground duration-200"
              style={{ animationDelay: `${Math.min(i, 10) * 40}ms`, animationFillMode: "backwards" }}
            >
              • {gap}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
