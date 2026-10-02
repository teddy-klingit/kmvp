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
  fields,
}: {
  action: (prev: AgentState, formData: FormData) => Promise<AgentState>;
  label: string;
  pendingLabel: string;
  /** "action" is the orange pill: only for the client's own next action (e.g. Draft with AI). */
  variant?: "primary" | "secondary" | "action";
  align?: "start" | "end";
  /** Hidden inputs sent with the action (e.g. which report to write). */
  fields?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={cn("flex flex-col gap-1.5", align === "end" ? "items-end" : "items-start")}>
      {fields && Object.entries(fields).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <button
        type="submit"
        disabled={pending}
        className={variant === "action" ? cn(pillClass("primary"), "bg-brand-orange text-brand-ink hover:bg-brand-orange hover:brightness-95") : pillClass(variant, "sm")}
      >
        {pending && <Loader2 className="size-3.5 animate-spin" />}
        {pending ? pendingLabel : label}
      </button>
      {state.error && <p className="m-0 max-w-[320px] text-[12px] text-ds-danger-text">{state.error}</p>}
    </form>
  );
}
