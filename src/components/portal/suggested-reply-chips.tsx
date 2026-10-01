"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Check } from "lucide-react";
import { postCommentAction } from "@/lib/actions/project-actions";

function ChipButton({ label, sent }: { label: string; sent: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending || sent}
      className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-left text-sm font-medium text-foreground transition-[color,border-color,background-color,transform] duration-100 ease-out hover:border-primary hover:text-primary active:scale-95 disabled:hover:border-border disabled:hover:text-foreground disabled:opacity-70 disabled:active:scale-100"
    >
      {sent && <Check className="size-3.5 text-ink" />}
      {sent ? "Sent" : label}
    </button>
  );
}

function ReplyChip({ projectId, text }: { projectId: string; text: string }) {
  const [sent, setSent] = useState(false);

  return (
    <form
      action={async (formData) => {
        await postCommentAction(formData);
        setSent(true);
      }}
    >
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="body" value={text} />
      <ChipButton label={text} sent={sent} />
    </form>
  );
}

export function SuggestedReplyChips({ projectId, suggestions }: { projectId: string; suggestions: string[] }) {
  if (suggestions.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {suggestions.map((s) => (
        <ReplyChip key={s} projectId={projectId} text={s} />
      ))}
    </div>
  );
}
