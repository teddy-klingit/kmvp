"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import type { ReviewItem } from "@/lib/review";
import { textDiff } from "@/lib/review-text";
import { acceptAllCopyAction, resolveCopySuggestionAction, suggestCopyAction, type ReviewState } from "@/lib/actions/review-actions";
import { ApproveButton, ReviewFooter } from "@/components/review/review-footer";
import { ReviewShell, type ShellHeader } from "@/components/review/shell";
import { cn } from "@/lib/utils";

/**
 * Copy review (ReviewCopy.dc.html): a table of element × language. Edits are suggestions (added in pale lime,
 * removed struck through in #B455B6); each line shows a character-limit bar and whether it follows the voice
 * rules; legal lines from Brand OS are locked. The panel lists the suggestions with Accept / Reject.
 */
export function CopyView({ shell, projectId, items, canReview, mode }: { shell: ShellHeader; projectId: string; items: ReviewItem[]; canReview: boolean; mode: "suggest" | "read" }) {
  const langs = [...new Map(items.flatMap((i) => i.copy?.lines ?? []).map((l) => [l.lang, l.label])).entries()];
  const suggestions = items.flatMap((i) => (i.copy?.suggestions ?? []).map((s) => ({ ...s, item: i })));
  const open = items.filter((i) => i.status === "IN_REVIEW");

  const main = (
    <div className="flex flex-col gap-4 p-5 min-[900px]:p-8">
      <p className="m-0 text-right text-[14px] text-brand-ink-2">{mode === "suggest" ? (canReview ? "Click a line to suggest an edit" : "Suggestions show inline") : "Read view: the copy as it will run"}</p>
      <div className="overflow-x-auto rounded-2xl bg-white">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr className="text-[13px] text-brand-mute">
              <th className="w-[160px] px-6 py-4 text-left font-normal">Element</th>
              {langs.map(([lang, label]) => (
                <th key={lang} className="px-4 py-4 text-left font-normal">
                  {label}
                </th>
              ))}
              <th className="px-6 py-4 text-right font-normal">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-t border-brand-line align-top">
                <td className="px-6 py-5 text-[15px]">{i.copy!.element}</td>
                {langs.map(([lang]) => {
                  const line = i.copy!.lines.find((l) => l.lang === lang);
                  if (!line) return <td key={lang} />;
                  const s = i.copy!.suggestions.find((x) => x.lang === lang);
                  return <CopyCell key={lang} item={i} line={line} suggestion={mode === "suggest" ? (s?.text ?? null) : null} editable={mode === "suggest" && canReview && !i.copy!.locked} read={mode === "read"} />;
                })}
                <td className="px-6 py-5 text-right">
                  {i.copy!.suggestions.length > 0 ? (
                    <span className="whitespace-nowrap rounded-full bg-brand-peach-pale px-2.5 py-1 text-[13px]">
                      {i.copy!.suggestions.length} suggestion{i.copy!.suggestions.length === 1 ? "" : "s"}
                    </span>
                  ) : i.status === "APPROVED" || i.status === "DELIVERED" ? (
                    <span aria-label="Approved" className="inline-flex size-7 items-center justify-center rounded-full bg-[#8D9E47]">
                      <Check className="size-4 text-white" strokeWidth={3} />
                    </span>
                  ) : canReview && i.status === "IN_REVIEW" ? (
                    <ApproveButton projectId={projectId} ids={[i.id]} label="Approve" variant="secondary" />
                  ) : (
                    <span className="text-[13px] text-brand-ink-2">{i.status === "CHANGES_REQUESTED" ? "Changes asked" : "In review"}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-5 text-[14px] text-brand-ink-2">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-3 w-5 rounded-[3px] bg-brand-lime-pale" /> Added
        </span>
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-5 bg-[#B455B6]" /> Removed
        </span>
        <span className="flex-1 text-right">Checked against your voice rules · legal lines come from Brand OS</span>
      </div>
    </div>
  );

  return (
    <ReviewShell
      {...shell}
      main={main}
      panel={
        <div className="flex flex-col">
          <h2 className="m-0 border-b border-brand-line px-6 py-5 text-[20px] font-normal">Suggestions</h2>
          <div className="flex items-center px-6 pt-4">
            <span className="flex-1 text-[15px]">
              {suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"}
            </span>
            {suggestions.length > 1 && canReview && (
              <form action={acceptAllCopyAction}>
                <input type="hidden" name="projectId" value={projectId} />
                <button type="submit" className="text-[14px] text-brand-ink underline underline-offset-2">
                  Accept all
                </button>
              </form>
            )}
          </div>
          <div className="flex flex-col gap-3 px-3 py-3">
            {suggestions.length === 0 && <p className="m-0 px-3 py-2 text-[14px] text-brand-ink-2">No open suggestions. Click a line to suggest an edit.</p>}
            {suggestions.map((s) => {
              const line = s.item.copy!.lines.find((l) => l.lang === s.lang);
              const diff = textDiff(line?.text ?? "", s.text).filter((d) => d.type !== "same");
              return (
                <article key={`${s.item.id}-${s.id}`} className="flex flex-col gap-2 rounded-[14px] border border-brand-peach-line bg-brand-peach-pale/50 px-4 py-4">
                  <span className="text-[13px] text-brand-ink-2">
                    {s.by} · {s.item.copy!.element} · {s.label}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-[15px]">
                    {diff.map((d, i) => (
                      <span key={i} className={d.type === "removed" ? "text-[#B455B6] line-through" : "rounded-[4px] bg-brand-lime-pale px-1"}>
                        {d.text.trim() || "(space)"}
                      </span>
                    ))}
                    {diff.length === 1 && diff[0].type === "removed" && <span className="text-[13px] text-brand-ink-2">removed</span>}
                  </span>
                  {s.note && <span className="text-[14px] text-brand-ink-2">{s.note}</span>}
                  {canReview && (
                    <span className="flex gap-2 pt-1">
                      {(["accept", "reject"] as const).map((d) => (
                        <form key={d} action={resolveCopySuggestionAction}>
                          <input type="hidden" name="assetId" value={s.item.id} />
                          <input type="hidden" name="suggestionId" value={s.id} />
                          <input type="hidden" name="decision" value={d} />
                          <button type="submit" className={cn("rounded-full px-5 py-2 font-brand-mono text-[13px]", d === "accept" ? "bg-brand-ink text-white" : "border border-brand-outline bg-white")}>
                            {d === "accept" ? "Accept" : "Reject"}
                          </button>
                        </form>
                      ))}
                    </span>
                  )}
                </article>
              );
            })}
          </div>
        </div>
      }
      footer={<ReviewFooter projectId={projectId} canReview={canReview} openIds={open.map((i) => i.id)} note="Approve per line, or all lines once suggestions are handled." approveLabel="Approve all copy" />}
    />
  );
}

function CopyCell({ item, line, suggestion, editable, read }: { item: ReviewItem; line: NonNullable<ReviewItem["copy"]>["lines"][number]; suggestion: string | null; editable: boolean; read: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<ReviewState, FormData>(async (prev, fd) => {
    const r = await suggestCopyAction(prev, fd);
    if (r.ok) setEditing(false);
    return r;
  }, {});
  const len = line.text.length;
  return (
    <td className="px-4 py-5">
      {editing ? (
        <form action={action} className="flex flex-col gap-2">
          <input type="hidden" name="assetId" value={item.id} />
          <input type="hidden" name="lang" value={line.lang} />
          <textarea name="text" defaultValue={suggestion ?? line.text} rows={3} autoFocus className="w-full resize-none rounded-[10px] border border-brand-outline px-3 py-2 text-[15px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" />
          <input name="note" placeholder="Why (optional)" className="rounded-[10px] border border-brand-outline px-3 py-1.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-brand-orange" />
          {state.error && <span className="text-[12px] text-ds-danger-text">{state.error}</span>}
          <span className="flex gap-2">
            <button type="submit" disabled={pending} className="rounded-full bg-brand-ink px-4 py-1.5 text-[13px] text-white">
              Suggest
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-[13px] text-brand-ink-2 underline underline-offset-2">
              Cancel
            </button>
          </span>
        </form>
      ) : (
        <button type="button" disabled={!editable} onClick={() => setEditing(true)} className={cn("flex w-full flex-col gap-2 rounded-[8px] text-left", editable && "hover:bg-[#FBF9F4]")}>
          <span className="text-[16px] leading-[1.45]">
            {suggestion
              ? textDiff(line.text, suggestion).map((d, i) => (
                  <span key={i} className={d.type === "removed" ? "text-[#B455B6] line-through" : d.type === "added" ? "rounded-[3px] bg-brand-lime-pale" : undefined}>
                    {d.text}
                  </span>
                ))
              : line.text}
          </span>
          {!read &&
            (item.copy!.locked ? (
              <span className="text-[13px] text-brand-mute">From Brand OS · locked</span>
            ) : (
              <span className="flex flex-wrap items-center gap-2 text-[13px] text-brand-mute">
                {line.limit && (
                  <>
                    <span aria-hidden className="h-1 w-14 overflow-hidden rounded-full bg-brand-line">
                      <span className={cn("block h-full", len > line.limit ? "bg-brand-orange" : "bg-brand-ink")} style={{ width: `${Math.min(100, (len / line.limit) * 100)}%` }} />
                    </span>
                    <span className={cn("tabular-nums", len > line.limit && "text-brand-orange-text")}>
                      {len}/{line.limit}
                    </span>
                  </>
                )}
                {line.voice && <span className={cn("rounded-full px-2 py-0.5", line.voice.ok ? "bg-brand-lime-pale text-brand-ink" : "bg-brand-peach-pale text-brand-orange-text")}>{line.voice.note}</span>}
              </span>
            ))}
        </button>
      )}
    </td>
  );
}
