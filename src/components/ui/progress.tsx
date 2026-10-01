"use client";

import * as React from "react";
import * as ProgressPrimitive from "@radix-ui/react-progress";
import { cn } from "@/lib/utils";
import { DIAGRAM_FADE_START, diagramFadeEnd } from "@/lib/chart-theme";

/** The app's "Meter" — track is beige and fully rounded, the fill is the
 * diagramFade: orange at the base, blending toward green as the value
 * climbs, never a flat block. */
function Progress({
  className,
  value,
  indicatorClassName,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & { indicatorClassName?: string }) {
  const v = value ?? 0;
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-eggshell", className)}
      {...props}
    >
      <ProgressPrimitive.Indicator
        className={cn("h-full w-full flex-1 transition-transform", indicatorClassName)}
        style={{
          transform: `translateX(-${100 - v}%)`,
          backgroundImage: `linear-gradient(90deg, ${DIAGRAM_FADE_START}, ${diagramFadeEnd(v / 100)})`,
        }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
