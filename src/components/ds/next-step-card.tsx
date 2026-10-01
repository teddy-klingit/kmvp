import { CheckSquare, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The same card in every stage. "turn" = the client's turn (orange-tinted
 * border + icon tile, "YOUR TURN"); "klingit" = neutral, "KLINGIT IS ON IT".
 * No gradients, no coloured left bar.
 */
export function NextStepCard({
  variant,
  title,
  description,
  actions,
  icon,
  eyebrow,
}: {
  variant: "turn" | "klingit";
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  eyebrow?: string;
}) {
  const turn = variant === "turn";
  return (
    <section
      aria-label="Next step"
      className={cn(
        "flex flex-col items-start gap-4 rounded-[12px] border bg-ds-card px-6 py-5 shadow-ds md:flex-row md:items-center",
        turn ? "border-ds-turn-border" : "border-ds-border"
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-[10px] [&_svg]:size-5",
          turn ? "bg-ds-turn-tint text-ds-turn-strong" : "bg-ds-subtle text-ds-text-2"
        )}
      >
        {icon ?? (turn ? <CheckSquare strokeWidth={1.75} /> : <Clock3 strokeWidth={1.75} />)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn("text-[12px] font-semibold tracking-[0.02em]", turn ? "text-ds-turn-strong" : "text-ds-text-2")}>
          {eyebrow ?? (turn ? "YOUR TURN" : "KLINGIT IS ON IT")}
        </span>
        <span className="text-[16px] font-semibold text-ds-text">{title}</span>
        {description && <span className="text-[14px] text-ds-text-2">{description}</span>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </section>
  );
}
