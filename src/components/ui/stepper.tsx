import { cn } from "@/lib/utils";
import { Check } from "lucide-react";

export type StepState = "completed" | "active" | "upcoming";

export type StepperStep = {
  label: string;
  state: StepState;
  caption?: string;
};

/** Horizontal pipeline stepper — matches the "Brief > Estimate > Production >
 * QA > Delivery > Sign-off" stage tracker on Project Timeline. */
function Stepper({ steps, className }: { steps: StepperStep[]; className?: string }) {
  return (
    <div className={cn("flex items-start", className)}>
      {steps.map((step, i) => (
        <div key={step.label} className={cn("flex flex-1 flex-col", i === steps.length - 1 && "flex-none")}>
          <div className="flex items-center">
            <div
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold text-ink",
                step.state === "completed" && "border-ink/15 bg-success",
                step.state === "active" && "border-2 border-ink bg-card",
                step.state === "upcoming" && "border-border bg-card text-muted-foreground"
              )}
            >
              {step.state === "completed" ? (
                <Check className="size-3.5" />
              ) : step.state === "active" ? (
                <span className="size-2 rounded-full bg-ink" />
              ) : null}
            </div>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "h-0.5 flex-1",
                  step.state === "completed" ? "bg-success" : "bg-border"
                )}
              />
            )}
          </div>
          <div className="mt-2 pr-2">
            <p
              className={cn(
                "text-sm",
                step.state === "active" ? "font-semibold text-ink" : "font-medium text-foreground"
              )}
            >
              {step.label}
            </p>
            {step.caption && <p className="text-xs text-muted-foreground">{step.caption}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

export { Stepper };
