"use client";

import { useEffect, useRef } from "react";

/** On narrow screens the timeline scrolls sideways — start it with the current step in view. */
export function TimelineScroller({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    const current = el?.querySelector<HTMLElement>("[data-current]");
    if (!el || !current) return;
    el.scrollLeft = current.offsetLeft - el.clientWidth / 2 + current.offsetWidth / 2;
  }, []);
  return (
    <div ref={ref} className="-mx-1 overflow-x-auto px-1">
      {children}
    </div>
  );
}
