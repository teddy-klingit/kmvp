"use client";

import { useState, useTransition } from "react";
import { CardHeader } from "@/components/ds/card";
import { pillClass } from "@/components/ds/button";
import { discardDraftAction } from "@/lib/actions/brand-draft-actions";

type EmptyState = Record<string, never>;
type DocAction = (prev: EmptyState, formData: FormData) => Promise<EmptyState>;
type Draft = { id: string; content: string; basis: string | null };

/**
 * A Brand IQ section in its card (BrandSection.dc.html): view mode with Edit, or edit mode with the prompt,
 * the standard textarea (1px border, soft focus ring, writing-assistant extensions opted out), Save /
 * Cancel and Rewrite with AI. A pending agent draft shows on top: "Use draft" opens it in the editor (the
 * client still saves), "Discard" drops it. Nothing reaches Brand OS without the client's Save.
 */
export function EditableDoc({
  title,
  action,
  hidden,
  initialValue,
  placeholder,
  helperText,
  draft,
  rewrite,
  footer,
  children,
}: {
  title: string;
  action: DocAction;
  hidden: Record<string, string>;
  initialValue: string;
  placeholder?: string;
  /** The section's question, shown above the field. */
  helperText?: string;
  draft?: Draft | null;
  /** The "Rewrite with AI" control (a server-action form). */
  rewrite?: React.ReactNode;
  /** Under the editor: the section's source chips. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(!initialValue && !draft);
  const [value, setValue] = useState(initialValue);
  const [fromDraft, setFromDraft] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const edit = (v: string, draftId: string | null) => {
    setValue(v);
    setFromDraft(draftId);
    setEditing(true);
  };

  return (
    <>
      <CardHeader
        title={title}
        action={
          editing ? (
            <span className="font-brand-mono text-[12px] text-brand-ink-2">EDITING</span>
          ) : (
            <button type="button" onClick={() => edit(initialValue, null)} className={pillClass("secondary", "sm")}>
              Edit
            </button>
          )
        }
      />
      <div className="flex flex-col gap-5 px-6 pb-6 pt-5">
        {draft && fromDraft !== draft.id && (
          <div className="flex flex-col gap-3 rounded-[10px] border border-dashed border-brand-lime-strong bg-[#F1F7E1] p-4">
            <span className="font-brand-mono text-[11px] text-brand-ink-2">DRAFT BY THE BRAND AGENT{draft.basis ? ` · ${draft.basis.toUpperCase()}` : ""}</span>
            <p className="m-0 whitespace-pre-line text-[14px] leading-[1.55]">{draft.content}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => edit(draft.content, draft.id)} className={pillClass("primary", "sm")}>
                Use draft
              </button>
              <form action={discardDraftAction}>
                <input type="hidden" name="draftId" value={draft.id} />
                <button type="submit" className={pillClass("secondary", "sm")}>
                  Discard
                </button>
              </form>
            </div>
          </div>
        )}

        {editing ? (
          <form
            action={(formData) => {
              startTransition(async () => {
                await action({}, formData);
                setEditing(false);
                setFromDraft(null);
              });
            }}
            className="flex flex-col gap-4"
          >
            {Object.entries(hidden).map(([k, v]) => (
              <input key={k} type="hidden" name={k} value={v} />
            ))}
            {fromDraft && <input type="hidden" name="draftId" value={fromDraft} />}
            {helperText && (
              <label htmlFor={`doc-${title}`} className="text-[14px] text-brand-ink-2">
                {helperText}
              </label>
            )}
            <textarea
              id={`doc-${title}`}
              name="value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={placeholder}
              autoFocus={Boolean(initialValue) || Boolean(fromDraft)}
              disabled={pending}
              data-gramm="false"
              data-gramm_editor="false"
              data-enable-grammarly="false"
              data-lt-active="false"
              className="min-h-40 w-full resize-y rounded-[10px] border border-brand-outline bg-white px-4 py-3.5 text-[16px] leading-relaxed text-brand-ink outline-none transition-[border-color,box-shadow] placeholder:text-brand-ink-2/70 focus:border-brand-lime-strong focus:ring-4 focus:ring-brand-lime/60 disabled:opacity-60"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={pending} className={pillClass("primary")}>
                {pending ? "Saving…" : "Save"}
              </button>
              {(initialValue || draft) && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setEditing(false);
                    setFromDraft(null);
                    setValue(initialValue);
                  }}
                  className={pillClass("secondary")}
                >
                  Cancel
                </button>
              )}
              <span className="flex-1" />
              {rewrite}
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            {children}
            {rewrite && <div className="flex justify-end">{rewrite}</div>}
          </div>
        )}
        {footer}
      </div>
    </>
  );
}
