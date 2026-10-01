"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function RatingStars({ name }: { name: string }) {
  // Empty until the client picks: we never pre-fill a score.
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;

  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={value || ""} />
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => setValue(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
          className="flex size-11 items-center justify-center sm:size-8"
          aria-label={`Rate ${n} out of 5`}
          aria-pressed={n <= value}
        >
          <Star
            strokeWidth={1.75}
            className={cn("size-5", n <= shown ? "fill-ds-star text-ds-star-stroke" : "fill-none text-ds-text-3")}
          />
        </button>
      ))}
    </div>
  );
}
