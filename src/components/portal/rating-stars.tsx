"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export function RatingStars({ name }: { name: string }) {
  const [value, setValue] = useState(5);
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;

  return (
    <div className="flex items-center gap-1">
      <input type="hidden" name={name} value={value} />
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => setValue(n)}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(null)}
          className="p-0.5"
          aria-label={`Rate ${n} out of 5`}
        >
          <Star
            className={cn("size-5", n <= shown ? "fill-warning text-ink" : "text-border")}
          />
        </button>
      ))}
    </div>
  );
}
