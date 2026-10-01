"use client";

import { useActionState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { generateSeoReportAction, type GenerateSeoReportState } from "@/lib/actions/seo-actions";

const initialState: GenerateSeoReportState = {};

export function GenerateSeoReportButton({ label }: { label: string }) {
  const [state, formAction, pending] = useActionState(generateSeoReportAction, initialState);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1.5">
      <Button type="submit" size="sm" variant="accent" disabled={pending} className="gap-1.5">
        <Sparkles className="size-3.5" />
        {pending ? "Auditing sites…" : label}
      </Button>
      {state.error && <p className="text-xs text-danger-foreground">{state.error}</p>}
    </form>
  );
}
