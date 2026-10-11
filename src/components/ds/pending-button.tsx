"use client";

import { useFormStatus } from "react-dom";
import { pillClass } from "@/components/ds/button";
import { cn } from "@/lib/utils";

/** A form's submit pill that disables itself while the form is sending, so a slow action can't be sent twice. */
export function PendingButton({ children, pendingLabel, variant = "secondary", size = "sm", className }: { children: React.ReactNode; pendingLabel: string; variant?: "primary" | "secondary"; size?: "sm" | "md"; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={cn(pillClass(variant, size), "disabled:opacity-60", className)}>
      {pending ? pendingLabel : children}
    </button>
  );
}
