import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/** "Everything that leads onward carries a ring with an arrow" — a round
 * outline with a horizontal arrow, used at the right edge of a row or card
 * that links elsewhere. Purely decorative; wrap the whole row/card in the
 * actual <Link>. */
export function LinkArrow({ className }: { className?: string }) {
  return (
    <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-ink", className)}>
      <ArrowRight className="size-3.5" />
    </span>
  );
}
