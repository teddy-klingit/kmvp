"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/** prefers-reduced-motion, as a store (false on the server: the first paint is plain either way). */
export function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(prefers-reduced-motion: reduce)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false
  );
}

type Word = { text: string; bold: boolean };

/** "**Summer social pack**" → bold words; nothing else is markup. */
function words(text: string): Word[] {
  return text
    .split(/(\*\*[^*]+\*\*)/)
    .flatMap((part) => {
      const bold = part.startsWith("**") && part.endsWith("**");
      const body = bold ? part.slice(2, -2) : part;
      return body.split(/(\s+)/).filter(Boolean).map((t) => ({ text: t, bold }));
    });
}

/**
 * Agent text that streams in word by word (~32 ms a word, each chunk rising 4px as it fades in), then calls onDone.
 * Without `animate` (or with reduced motion) it's shown at once.
 */
export function StreamedText({ text, animate, onDone, className }: { text: string; animate: boolean; onDone?: () => void; className?: string }) {
  const reduced = useReducedMotion();
  const list = words(text);
  const live = animate && !reduced;
  const [shown, setShown] = useState(live ? 0 : list.length);
  useEffect(() => {
    if (!live) return;
    let n = 0;
    const timer = window.setInterval(() => {
      n += 1;
      setShown(n);
      if (n >= list.length) {
        window.clearInterval(timer);
        onDone?.();
      }
    }, 32);
    return () => window.clearInterval(timer);
    // The text of a message never changes; run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const visible = live ? list.slice(0, shown) : list;
  return (
    <span className={className}>
      {visible.map((w, i) =>
        /^\s+$/.test(w.text) ? (
          <span key={i}>{w.text}</span>
        ) : (
          <span key={i} className={cn(live && "studio-rise inline-block", w.bold && "font-semibold")}>
            {w.text}
          </span>
        )
      )}
    </span>
  );
}

/** What the agent is doing while it works: one line with a shimmer and three pulsing dots. */
export function ThinkingLine({ text }: { text: string }) {
  return (
    <span className="flex items-center gap-2 text-[14px]" role="status">
      <span className="studio-shimmer">{text}</span>
      <span aria-hidden className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span key={i} className="studio-dot size-1 rounded-full bg-brand-mute" style={{ animationDelay: `${i * 160}ms` }} />
        ))}
      </span>
    </span>
  );
}
