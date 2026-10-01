"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type EmptyState = Record<string, never>;
type DocAction = (prev: EmptyState, formData: FormData) => Promise<EmptyState>;

export function EditableDoc({
  action,
  hidden,
  initialValue,
  placeholder,
  helperText,
  children,
}: {
  action: DocAction;
  hidden: Record<string, string>;
  initialValue: string;
  placeholder?: string;
  helperText?: string;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!editing) {
    return (
      <div className="group relative">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="absolute right-0 top-0 flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-muted-foreground opacity-0 transition-opacity duration-150 hover:text-foreground group-hover:opacity-100"
        >
          <Pencil className="size-3" />
          Edit
        </button>
        {children}
      </div>
    );
  }

  return (
    <form
      action={(formData) => {
        startTransition(async () => {
          await action({}, formData);
          setEditing(false);
        });
      }}
      className="flex flex-col gap-3"
    >
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
      {/* Standard input style: 1px border and a soft focus ring (not the 2px ink ring). Writing-assistant
          extensions (Grammarly, LanguageTool) are opted out so their floating bubble doesn't sit inside the field. */}
      <textarea
        name="value"
        defaultValue={initialValue}
        placeholder={placeholder}
        autoFocus
        disabled={pending}
        data-gramm="false"
        data-gramm_editor="false"
        data-enable-grammarly="false"
        data-lt-active="false"
        className="min-h-32 w-full resize-y rounded-[8px] border border-ds-control-border bg-white px-3 py-2.5 text-[14px] leading-relaxed text-ds-text outline-none transition-[border-color,box-shadow] placeholder:text-ds-text-3 focus:border-ds-text-3 focus:ring-4 focus:ring-ds-text/5 disabled:opacity-60"
      />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending} className="gap-1.5">
          <Check className="size-3.5" />
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="gap-1.5"
        >
          <X className="size-3.5" />
          Cancel
        </Button>
      </div>
    </form>
  );
}
