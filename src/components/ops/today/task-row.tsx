"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import type { Task } from "@/lib/today";
import type { EstimateRow, InlineData } from "@/lib/today-inline";
import { tickTaskAction, todayAskCreatorAction, todayAssignAction, todayEstimateAction, todayMoveDateAction, todayNudgeAction, todayReplyAction, todayRequestAction, type TodayState } from "@/lib/actions/today-actions";
import { cn } from "@/lib/utils";
import { clientPill } from "@/components/ops/client-pill";
import { MessagePmButton } from "@/components/pm-panel/pm-panel-provider";

/**
 * One Today row (Phase T): client, project, kind, the verb sentence, one line of context, the due tag, one primary
 * and at most one secondary action, acting in place: the estimate editor, a reply box, the drafted nudge, approve or
 * decline, assign, move the date. Quality check is the one action that opens another page.
 */

const DUE_TONE = { late: "bg-[#FBE3DF] text-[#A8321F]", soon: "bg-[#FDEBDD] text-brand-orange-text", ok: "bg-brand-page text-brand-ink-2" };
const STATUS_TONE: Record<EstimateRow["status"], string> = { "Price List": "bg-[#EEF2DF] text-[#5E6B2A]", Check: "bg-[#FDEBDD] text-brand-orange-text", Quote: "bg-[#FBE3DF] text-[#A8321F]", Merged: "bg-brand-page text-brand-ink-2", "PM credits": "bg-[#E3E8F6] text-[#2E3F7A]" };
const pill = (primary: boolean) => cn("inline-flex h-10 items-center justify-center rounded-full px-4 font-brand-mono text-[12px] no-underline disabled:opacity-40 sm:h-9", primary ? "bg-brand-ink text-white" : "border border-[#CFC8B8] bg-white text-brand-ink hover:border-brand-ink");
const field = "w-full rounded-[10px] border border-[#CFC8B8] bg-white px-3 py-2 text-[14px] outline-none focus:border-brand-ink";

type Panel = null | "estimate" | "reply" | "ask" | "nudge" | "move";

function Hidden({ task }: { task: Task }) {
  return (
    <>
      <input type="hidden" name="key" value={task.key} />
      <input type="hidden" name="label" value={`${task.sentence} (${task.clientName})`} />
      <input type="hidden" name="clientId" value={task.clientId} />
    </>
  );
}

function Result({ s }: { s: TodayState }) {
  if (!s.error && !s.ok) return null;
  return <span className={cn("text-[13px]", s.error ? "text-[#A8321F]" : "text-[#5E6B2A]")}>{s.error ?? s.ok}</span>;
}

function EstimatePanel({ task, data, onClose }: { task: Task; data: Extract<InlineData, { kind: "ESTIMATE" }>; onClose: () => void }) {
  const [rows, setRows] = useState(data.rows);
  const [state, act, pending] = useActionState(todayEstimateAction, {});
  const creative = rows.filter((r) => r.balance === "creative").reduce((n, r) => n + (r.credits ?? 0), 0);
  const pm = rows.filter((r) => r.balance === "pm").reduce((n, r) => n + (r.credits ?? 0), 0);
  const missing = rows.filter((r) => r.editable && (r.status === "Check" || r.status === "Quote") && r.credits == null).length;
  const payload = useMemo(() => JSON.stringify(rows.map((r) => ({ input: r.input, credits: r.credits, editable: r.editable }))), [rows]);
  return (
    <form action={act} className="mt-3 flex flex-col gap-3 rounded-[12px] border border-brand-line bg-[#FCFBF8] p-4">
      <Hidden task={task} />
      <input type="hidden" name="projectId" value={data.projectId} />
      <input type="hidden" name="rows" value={payload} />
      <input type="hidden" name="duplicates" value={(task.duplicates ?? []).map((d) => d.id).join(",")} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[14px] font-medium">Estimate · {task.subject}</span>
        <span className="text-[12px] text-brand-ink-2">{data.splitNote}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] border-collapse text-[13px]">
          <thead>
            <tr className="text-left font-brand-mono text-[11px] uppercase tracking-[0.04em] text-brand-ink-2">
              <th className="py-2 pr-3 font-normal">What the client needs</th>
              <th className="py-2 pr-3 font-normal">Price List match</th>
              <th className="py-2 pr-3 font-normal" />
              <th className="py-2 text-right font-normal">Credits</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className="border-t border-brand-line">
                <td className="py-2.5 pr-3">{r.need}</td>
                <td className="py-2.5 pr-3 text-brand-ink-2">{r.match}</td>
                <td className="py-2.5 pr-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-[12px]", STATUS_TONE[r.status])}>{r.status}</span>
                </td>
                <td className="py-2.5 text-right">
                  <input
                    aria-label={`Credits for ${r.need}`}
                    type="number"
                    min={0}
                    step={0.5}
                    disabled={!r.editable}
                    value={r.credits ?? ""}
                    placeholder="–"
                    onChange={(e) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, credits: e.target.value === "" ? null : Number(e.target.value) } : x)))}
                    className={cn("h-9 w-20 rounded-[8px] border bg-white px-2 text-right tabular-nums outline-none", r.editable && r.credits == null ? "border-brand-orange" : "border-[#CFC8B8]", !r.editable && "bg-brand-page text-brand-ink-2")}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t-2 border-brand-ink pt-3">
        <span className="text-[14px] tabular-nums">
          {creative} creative + {pm} PM credits
        </span>
        {data.creativeLeft != null && creative > data.creativeLeft && (
          <span className="text-[13px] text-brand-ink-2">
            {data.clientName} has {Math.round(data.creativeLeft)} creative credits left this month. The rest needs a pack or next month&apos;s credits.
          </span>
        )}
        <button type="submit" name="mode" value="save" disabled={pending} className={cn(pill(false), "ml-auto")}>
          Save draft
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" name="mode" value="send" disabled={pending || missing > 0} className="inline-flex h-10 items-center rounded-full bg-brand-orange px-4 font-brand-mono text-[12px] text-white disabled:opacity-40 sm:h-9">
          Send estimate to {data.clientName}
        </button>
        {missing > 0 && <span className="text-[13px] text-brand-ink-2">Put a number on {missing === 1 ? "the last Check or Quote line" : `${missing} Check or Quote lines`} first.</span>}
        <button type="button" onClick={onClose} className="text-[13px] underline">
          Close
        </button>
        <Result s={state} />
      </div>
      {task.duplicates?.length ? (
        <p className="m-0 flex items-center gap-2 rounded-[8px] bg-white px-3 py-2 text-[13px]">
          <AlertTriangle className="size-4 text-brand-orange" strokeWidth={1.75} /> This brief exists twice ({task.subject}). Sending merges the copy.
        </p>
      ) : null}
    </form>
  );
}

function TextPanel({ task, action, hidden, defaultValue, submit, placeholder, onClose }: { task: Task; action: (s: TodayState, f: FormData) => Promise<TodayState>; hidden: Record<string, string>; defaultValue?: string; submit: string; placeholder?: string; onClose: () => void }) {
  const [state, act, pending] = useActionState(action, {});
  return (
    <form action={act} className="mt-3 flex flex-col gap-2">
      <Hidden task={task} />
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <textarea name={hidden.itemId ? "text" : "body"} rows={3} defaultValue={defaultValue} placeholder={placeholder} className={field} />
      <span className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={pending} className={pill(true)}>
          {submit}
        </button>
        <button type="button" onClick={onClose} className={pill(false)}>
          Cancel
        </button>
        <Result s={state} />
      </span>
    </form>
  );
}

function OneClick({ task, action, fields, label, primary = true }: { task: Task; action: (s: TodayState, f: FormData) => Promise<TodayState>; fields: Record<string, string>; label: string; primary?: boolean }) {
  const [state, act, pending] = useActionState(action, {});
  return (
    <form action={act} className="flex items-center gap-2">
      <Hidden task={task} />
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <button type="submit" disabled={pending} className={pill(primary)}>
        {label}
      </button>
      {state.error && <Result s={state} />}
    </form>
  );
}

function RequestButtons({ task, data }: { task: Task; data: Extract<InlineData, { kind: "REQUEST" }> }) {
  const [state, act, pending] = useActionState(todayRequestAction, {});
  return (
    <form action={act} className="flex flex-wrap items-center justify-end gap-2">
      <Hidden task={task} />
      <input type="hidden" name="requestId" value={data.requestId} />
      <input name="note" placeholder="Note (optional)" aria-label="Note for the client" className="h-9 w-40 rounded-full border border-[#CFC8B8] bg-white px-3 text-[13px] outline-none focus:border-brand-ink" />
      <button type="submit" name="decision" value="decline" disabled={pending} className={pill(false)}>
        Decline
      </button>
      <button type="submit" name="decision" value="approve" disabled={pending} className={pill(true)}>
        Approve
      </button>
      {state.error && <Result s={state} />}
    </form>
  );
}

function MovePanel({ task, data, onClose }: { task: Task; data: Extract<InlineData, { kind: "DEADLINE" }>; onClose: () => void }) {
  const [state, act, pending] = useActionState(todayMoveDateAction, {});
  return (
    <form action={act} className="mt-3 flex flex-wrap items-end gap-2">
      <Hidden task={task} />
      <input type="hidden" name="projectId" value={data.projectId} />
      <label className="flex flex-col gap-1 text-[12px] text-brand-ink-2">
        New due date
        <input type="date" name="dueDate" defaultValue={data.dueDate ?? ""} className="h-9 rounded-[8px] border border-[#CFC8B8] bg-white px-2 text-[14px] text-brand-ink" />
      </label>
      <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[12px] text-brand-ink-2">
        Why (the client sees it)
        <input name="reason" required className="h-9 rounded-[8px] border border-[#CFC8B8] bg-white px-2 text-[14px] text-brand-ink" />
      </label>
      <button type="submit" disabled={pending} className={pill(true)}>
        Move and tell the client
      </button>
      <button type="button" onClick={onClose} className={pill(false)}>
        Cancel
      </button>
      <Result s={state} />
    </form>
  );
}

export function TaskRow({ task, inline, compact = false }: { task: Task; inline?: InlineData; compact?: boolean }) {
  const [panel, setPanel] = useState<Panel>(null);
  const toggle = (p: Panel) => setPanel((x) => (x === p ? null : p));
  const quote = task.context.match(/“[^”]*”/)?.[0] ?? "";

  const actions = (() => {
    const link = (a: { label: string; href: string }, primary = true) => (
      <Link href={a.href} className={pill(primary)}>
        {a.label}
      </Link>
    );
    if (task.ref.panelClientId)
      return (
        <MessagePmButton clientId={task.ref.panelClientId} dot={false} className={pill(true)}>
          Reply
        </MessagePmButton>
      );
    if (!inline) return <>{task.secondary && link(task.secondary, false)}{link(task.primary)}</>;
    switch (inline.kind) {
      case "ESTIMATE": {
        const single = task.primary.label.startsWith("Confirm");
        if (single && panel !== "estimate")
          return (
            <>
              <button type="button" className={pill(false)} onClick={() => toggle("estimate")}>
                Change
              </button>
              <OneClick task={task} action={todayEstimateAction} fields={{ projectId: inline.projectId, mode: "confirm", rows: JSON.stringify(inline.rows.map((r) => ({ input: r.input, credits: r.credits, editable: r.editable }))) }} label={task.primary.label} />
            </>
          );
        return (
          <button type="button" className={pill(panel !== "estimate")} onClick={() => toggle("estimate")}>
            {panel === "estimate" ? "Close" : "Price it"}
          </button>
        );
      }
      case "MESSAGE":
        return (
          <>
            {inline.creator && (
              <button type="button" className={pill(false)} onClick={() => toggle("ask")}>
                Ask {inline.creator.name}
              </button>
            )}
            <button type="button" className={pill(true)} onClick={() => toggle("reply")}>
              Reply
            </button>
          </>
        );
      case "PLAN":
        return (
          <>
            <button type="button" className={pill(false)} onClick={() => toggle("nudge")}>
              Edit
            </button>
            <OneClick task={task} action={todayNudgeAction} fields={{ itemId: inline.itemId, text: inline.draft }} label="Send nudge" />
          </>
        );
      case "REQUEST":
        return <RequestButtons task={task} data={inline} />;
      case "STAFFING":
        return (
          <>
            {link({ label: "See all", href: `/ops/projects/${inline.projectId}?edit=staffing#staffing` }, false)}
            {inline.candidates[0] && <OneClick task={task} action={todayAssignAction} fields={{ projectId: inline.projectId, staffMemberId: inline.candidates[0].staffMemberId, role: inline.role.replace(/^./, (c) => c.toUpperCase()) }} label={`Assign ${inline.candidates[0].name}`} />}
          </>
        );
      case "DEADLINE":
        return (
          <>
            <button type="button" className={pill(false)} onClick={() => toggle("move")}>
              Move date
            </button>
            {inline.creator ? (
              <button type="button" className={pill(true)} onClick={() => toggle("ask")}>
                Ask {inline.creator.name.split(" ")[0]} for an update
              </button>
            ) : (
              link(task.primary)
            )}
          </>
        );
    }
  })();

  const context =
    inline?.kind === "STAFFING" && inline.candidates.length
      ? `No one passed the auto-staff bar. Best fits: ${inline.candidates.map((c) => `${c.name} ${c.score}${c.note.includes("booked") ? ` (${c.note})` : ""}`).join(" · ")}.`
      : inline?.kind === "REQUEST" && inline.balance
        ? `${task.context} Balance goes ${inline.balance.before} → ${inline.balance.after}.`
        : task.context;

  return (
    <li className={cn("flex gap-4 border-t border-brand-line px-5 py-4 first:border-t-0 sm:px-6", panel === "estimate" && "border-l-[3px] border-l-brand-ink")}>
      <form action={tickTaskAction} className="pt-0.5">
        <Hidden task={task} />
        <button type="submit" aria-label={`Mark done: ${task.sentence}`} title="Mark done" className="group flex size-6 items-center justify-center rounded-full border border-[#CFC8B8] bg-white hover:border-brand-ink">
          <Check className="size-3.5 text-brand-ink opacity-0 group-hover:opacity-60" strokeWidth={2} />
        </button>
      </form>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            {!compact && (
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <span className={cn("rounded-full px-2 py-0.5 text-[12px]", clientPill(task.clientId))}>{task.clientName}</span>
                {task.projectId ? (
                  <Link href={`/ops/projects/${task.projectId}`} className="text-brand-ink no-underline hover:underline">
                    {task.subject}
                  </Link>
                ) : (
                  <span>{task.subject}</span>
                )}
                <span className="font-brand-mono text-[11px] uppercase tracking-[0.06em] text-brand-ink-2">{task.kind}</span>
              </span>
            )}
            <span className={cn("leading-[1.35] text-brand-ink", compact ? "text-[15px]" : "text-[16px]")}>
              {task.sentence}
              {compact && <span className="text-[13px] text-brand-ink-2"> · {task.subject}</span>}
            </span>
            {!compact && context && <span className="text-[13px] leading-[1.5] text-brand-ink-2">{context}</span>}
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <span className={cn("rounded-[6px] px-2 py-0.5 text-[12px]", DUE_TONE[task.due.tone])}>{task.due.label}</span>
            <span className="flex flex-wrap gap-2 sm:justify-end">{actions}</span>
          </div>
        </div>
        {panel === "estimate" && inline?.kind === "ESTIMATE" && <EstimatePanel task={task} data={inline} onClose={() => setPanel(null)} />}
        {panel === "reply" && inline?.kind === "MESSAGE" && <TextPanel task={task} action={todayReplyAction} hidden={{ projectId: inline.projectId }} submit="Send reply" placeholder="Your reply to the client" onClose={() => setPanel(null)} />}
        {panel === "ask" && (inline?.kind === "MESSAGE" || inline?.kind === "DEADLINE") && inline.creator && (
          <TextPanel
            task={task}
            action={todayAskCreatorAction}
            hidden={{ projectId: inline.projectId, creatorUserId: inline.creator.userId, creatorName: inline.creator.name }}
            defaultValue={inline.kind === "MESSAGE" ? `Can you take this one? The client wrote: ${quote}` : `Where are we on ${task.subject}? It was due ${task.due.label.includes("late") ? `and is now ${task.due.label}` : task.due.label}. What's a realistic date?`}
            submit={`Send to ${inline.creator.name.split(" ")[0]}`}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === "nudge" && inline?.kind === "PLAN" && <TextPanel task={task} action={todayNudgeAction} hidden={{ itemId: inline.itemId }} defaultValue={inline.draft} submit="Send nudge" onClose={() => setPanel(null)} />}
        {panel === "move" && inline?.kind === "DEADLINE" && <MovePanel task={task} data={inline} onClose={() => setPanel(null)} />}
      </div>
    </li>
  );
}
