"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { pillClass } from "@/components/ds/button";
import { cn } from "@/lib/utils";

type AgentState = { error?: string | null };

/** Runs one agent server action (Generate / Refresh) as a brand pill, with its error underneath. */
export function AgentButton({
  action,
  label,
  pendingLabel,
  variant = "secondary",
  align = "end",
}: {
  action: (prev: AgentState, formData: FormData) => Promise<AgentState>;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
  align?: "start" | "end";
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={cn("flex flex-col gap-1.5", align === "end" ? "items-end" : "items-start")}>
      <button type="submit" disabled={pending} className={pillClass(variant, "sm")}>
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        {pending ? pendingLabel : label}
      </button>
      {state.error && <p className="m-0 max-w-[320px] text-[12px] text-ds-danger-text">{state.error}</p>}
    </form>
  );
}
