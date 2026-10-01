"use client";

import { useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Card } from "@/components/ui/card";

const STORAGE_KEY = "klingit-smart-calendar-banner-dismissed";

/** Explains the dashed "Suggested" entries once, then stays dismissed —
 * per-viewer via localStorage, not a global setting. Starts hidden on the
 * server render and reveals itself on mount if the viewer hasn't dismissed
 * it yet, so there's no flash of "shown then immediately hidden". */
export function SmartCalendarBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== "1") setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <Card className="flex items-center gap-2.5 border-l-4 border-l-accent bg-accent-soft/30 p-3 text-sm">
      <Sparkles className="size-4 shrink-0 text-ink" />
      <p className="flex-1">
        <span className="font-medium">This is a smart calendar</span> — the dashed &quot;
        <Sparkles className="mb-0.5 inline size-3" /> Suggested&quot; entries below are new activities the system is
        proposing based on real performance, not scheduled yet. Review them under Plan suggestions.
      </p>
      <button
        type="button"
        onClick={() => {
          try {
            localStorage.setItem(STORAGE_KEY, "1");
          } catch {
            /* private-browsing or storage disabled — just hide for this session */
          }
          setVisible(false);
        }}
        className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        aria-label="Dismiss"
      >
        <X className="size-3.5" />
      </button>
    </Card>
  );
}
