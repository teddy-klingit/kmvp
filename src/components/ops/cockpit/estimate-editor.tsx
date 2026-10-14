"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ds/button";
import { saveEstimateAction, type CockpitState } from "@/lib/actions/cockpit-actions";
import { cn } from "@/lib/utils";

type Balance = "pm" | "creative";
export type PriceRow = { id: string; name: string; category: string | null; unit: string | null; creditCost: number | null; status: string; balance: string };
export type EditorLine = {
  id: string;
  deliverable: string;
  detail: string;
  quantity: number;
  credits: number;
  isCustom: boolean;
  customReason: string | null;
  priceListItemId: string | null;
  balance: string;
  needsConfirm: boolean;
  confirmed: boolean;
  taskType: string | null;
};
export type EditorNeed = { description: string; reason?: string; resolved: boolean };

type Orig = { credits: number; quantity: number };
type Row =
  | { key: string; kind: "price"; itemId: string; quantity: number; detail: string; credits: number | null; confirmed: boolean; orig?: Orig }
  | { key: string; kind: "custom"; deliverable: string; detail: string; quantity: number; credits: number; reason: string; balance: Balance; taskType: string | null; hours: number | null; orig?: Orig }
  | { key: string; kind: "pm"; credits: number; detail: string; orig?: Orig };

const inputCls = "h-[34px] rounded-[8px] border border-ds-control-border bg-white px-2.5 text-[14px] outline-none focus:border-ds-text-3";
const half = (n: number) => Math.round(n * 2) / 2;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0$/, ""));

/**
 * The PM's estimate editor (Phase S step 3). Lines come from the 2026 Price List (quantity × credits), plus custom
 * PM quotes (hours × the task type's multiplier, or a number) and the PM line. Estimate and quote items need the
 * PM's number and a tick before the estimate can go to the client. Credits split into PM and creative.
 */
export function EstimateEditor({
  projectId,
  lines,
  priceList,
  needs,
  multipliers,
  pmLine,
  clientHasVersion,
  clientFirstName,
  version,
  cancelHref,
}: {
  projectId: string;
  lines: EditorLine[];
  priceList: PriceRow[];
  needs: EditorNeed[];
  multipliers: Record<string, number>;
  pmLine: { percent: number; min: number };
  clientHasVersion: boolean;
  clientFirstName: string;
  version: number;
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState<CockpitState, FormData>(saveEstimateAction, {});
  const item = (id: string) => priceList.find((p) => p.id === id);
  const [rows, setRows] = useState<Row[]>(() =>
    lines.map((l): Row => {
      const orig = { credits: l.credits, quantity: l.quantity };
      if (!l.isCustom && !l.priceListItemId && l.balance === "pm") return { key: l.id, kind: "pm", credits: l.credits, detail: l.detail, orig };
      if (l.isCustom || !l.priceListItemId || !item(l.priceListItemId)) return { key: l.id, kind: "custom", deliverable: l.deliverable, detail: l.detail, quantity: l.quantity, credits: l.credits, reason: l.customReason ?? (l.priceListItemId ? "From the earlier price list" : ""), balance: l.balance === "pm" ? "pm" : "creative", taskType: l.taskType, hours: null, orig };
      return { key: l.id, kind: "price", itemId: l.priceListItemId, quantity: l.quantity, detail: l.detail, credits: l.needsConfirm ? l.credits : null, confirmed: l.confirmed, orig };
    })
  );
  const [resolutions, setResolutions] = useState<Record<number, { kind: "priced" | "excluded"; credits?: number }>>({});
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState("");

  const categories = useMemo(() => [...new Set(priceList.map((p) => p.category ?? "Other"))], [priceList]);
  const balanceOf = (r: Row): Balance => (r.kind === "pm" ? "pm" : r.kind === "custom" ? r.balance : item(r.itemId)?.balance === "pm" ? "pm" : "creative");
  const creditsOf = (r: Row) => {
    if (r.kind !== "price") return r.credits;
    const it = item(r.itemId);
    const list = it?.creditCost != null ? it.creditCost * r.quantity : 0;
    return it?.status === "fixed" && it.creditCost != null ? list : (r.credits ?? list);
  };
  const needsNumber = (r: Row) => r.kind === "price" && item(r.itemId)?.status !== "fixed";
  const pricedNeeds = Object.values(resolutions).reduce((n, r) => n + (r.kind === "priced" ? (r.credits ?? 0) : 0), 0);
  const sum = (b: Balance) => rows.filter((r) => balanceOf(r) === b).reduce((n, r) => n + creditsOf(r), 0);
  const pm = sum("pm");
  const creative = sum("creative") + pricedNeeds;
  const total = pm + creative;
  const origTotal = lines.reduce((n, l) => n + l.credits, 0);
  const unconfirmed = rows.filter((r) => r.kind === "price" && needsNumber(r) && !r.confirmed).length;

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? ({ ...r, ...patch } as Row) : r)));
  const payload = rows.map((r) =>
    r.kind === "price"
      ? { kind: "price", priceListItemId: r.itemId, quantity: r.quantity, detail: r.detail, credits: needsNumber(r) ? creditsOf(r) : null, confirmed: r.confirmed }
      : r.kind === "custom"
        ? { kind: "custom", deliverable: r.deliverable, detail: r.detail, quantity: r.quantity, credits: r.credits, reason: r.reason, balance: r.balance, taskType: r.taskType }
        : { kind: "pm", credits: r.credits, detail: r.detail }
  );
  const resolutionPayload = Object.entries(resolutions).map(([index, r]) => ({ index: Number(index), ...r }));
  const suggestedPm = Math.max(pmLine.min, half(sum("creative") * pmLine.percent));

  return (
    <form action={action}>
      <input type="hidden" name="projectId" value={projectId} />
      <input type="hidden" name="lines" value={JSON.stringify(payload)} />
      <input type="hidden" name="resolutions" value={JSON.stringify(resolutionPayload)} />
      {clientHasVersion && (
        <div className="flex items-center gap-2 bg-ds-watch-tint px-6 py-3 text-[13px] text-ds-watch-text">
          <AlertTriangle className="size-4 shrink-0" strokeWidth={1.75} />
          {clientFirstName} already has v{version}. Saving sends v{version + 1} for re-approval, with the changes highlighted for {clientFirstName === "The client" ? "them" : clientFirstName}.
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-[14px]">
          <thead>
            <tr className="text-left text-[12px] text-ds-text-2">
              <th scope="col" className="px-6 py-2.5 font-medium">Deliverable</th>
              <th scope="col" className="w-[88px] px-3 py-2.5 font-medium">Quantity</th>
              <th scope="col" className="w-[200px] px-3 py-2.5 font-medium">Credits</th>
              <th scope="col" className="w-[90px] px-3 py-2.5 font-medium">Balance</th>
              <th scope="col" className="w-[80px] px-3 py-2.5 text-right font-medium">Total</th>
              <th scope="col" className="w-[56px] px-6 py-2.5">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const credits = creditsOf(r);
              const it = r.kind === "price" ? item(r.itemId) : undefined;
              const changed = !r.orig || r.orig.credits !== credits || (r.kind !== "pm" && r.orig.quantity !== r.quantity);
              const name = r.kind === "price" ? (it?.name ?? "Removed from the price list") : r.kind === "pm" ? "Marketing PM: briefing, coordination and feedback" : r.deliverable;
              const waiting = r.kind === "price" && needsNumber(r) && !r.confirmed;
              return (
                <tr key={r.key} className={cn("border-t border-ds-divider align-top", changed && "bg-ds-note", waiting && "bg-ds-watch-tint/60")}>
                  <td className="px-6 py-2.5">
                    <div className="flex flex-col gap-1">
                      {r.kind === "custom" ? (
                        <input aria-label="Deliverable" value={r.deliverable} onChange={(e) => update(r.key, { deliverable: e.target.value })} className={cn(inputCls, "font-medium")} />
                      ) : (
                        <span className="font-medium text-ds-text">
                          {name}
                          {it?.unit ? <span className="font-normal text-ds-text-2"> · {it.unit}</span> : null}
                        </span>
                      )}
                      <input aria-label="Details" value={r.detail} placeholder="Details the client sees" onChange={(e) => update(r.key, { detail: e.target.value })} className={cn(inputCls, "h-8 text-[13px] text-ds-text-2")} />
                      {r.kind === "custom" && (
                        <>
                          <input aria-label="Reason for this custom line" value={r.reason} placeholder="Why it's quoted by hand (required)" onChange={(e) => update(r.key, { reason: e.target.value })} className={cn(inputCls, "h-8 text-[13px]")} />
                          <span className="flex flex-wrap items-center gap-2 text-[12px] text-ds-text-2">
                            <select aria-label="Task type" value={r.taskType ?? ""} onChange={(e) => update(r.key, { taskType: e.target.value || null, credits: e.target.value && r.hours != null ? half(r.hours * (multipliers[e.target.value] ?? 1)) : r.credits })} className={cn(inputCls, "h-8 text-[12px]")}>
                              <option value="">Credits typed in</option>
                              {Object.entries(multipliers).map(([t, m]) => (
                                <option key={t} value={t}>
                                  {t} · ×{m}
                                </option>
                              ))}
                            </select>
                            {r.taskType && (
                              <label className="flex items-center gap-1">
                                <input type="number" min={0} step="0.5" aria-label="Hours" value={r.hours ?? ""} onChange={(e) => {
                                  const hours = Math.max(0, Number(e.target.value) || 0);
                                  update(r.key, { hours, credits: half(hours * (multipliers[r.taskType ?? ""] ?? 1)) });
                                }} className={cn(inputCls, "h-8 w-[72px] text-[12px]")} />
                                hours
                              </label>
                            )}
                            <select aria-label="Balance" value={r.balance} onChange={(e) => update(r.key, { balance: e.target.value === "pm" ? "pm" : "creative" })} className={cn(inputCls, "h-8 text-[12px]")}>
                              <option value="creative">Creative</option>
                              <option value="pm">PM</option>
                            </select>
                          </span>
                        </>
                      )}
                      {r.kind === "price" && it && it.status !== "fixed" && (
                        <span className="text-[12px] text-ds-watch-text">
                          {it.status === "quote" ? "Quote item: set the number" : `Estimate item: list says ${it.creditCost != null ? fmt(it.creditCost * r.quantity) : "—"}, confirm or change it`}
                        </span>
                      )}
                      {!r.orig && <span className="text-[12px] text-ds-watch-text">New line</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {r.kind !== "pm" && (
                      <input type="number" min={1} aria-label="Quantity" value={r.quantity} onChange={(e) => update(r.key, { quantity: Math.max(1, Number(e.target.value) || 1) })} className={cn(inputCls, "w-[64px]")} />
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.kind === "price" && !needsNumber(r) ? (
                      <span className="inline-flex h-[34px] items-center text-ds-text-2">
                        {fmt(it?.creditCost ?? 0)} × {r.quantity}
                      </span>
                    ) : r.kind === "price" ? (
                      <span className="flex flex-col gap-1">
                        <input type="number" min={0} step="0.5" aria-label="Your number" value={r.credits ?? (it?.creditCost != null ? it.creditCost * r.quantity : "")} onChange={(e) => update(r.key, { credits: Math.max(0, Number(e.target.value) || 0), confirmed: false })} className={cn(inputCls, "w-[96px]")} />
                        <label className="flex items-center gap-1.5 text-[12px]">
                          <input type="checkbox" checked={r.confirmed} onChange={(e) => update(r.key, { confirmed: e.target.checked, credits: r.credits ?? creditsOf(r) })} className="size-4" />
                          Confirmed
                        </label>
                      </span>
                    ) : (
                      <span className="flex flex-col gap-1">
                        <input type="number" min={0} step="0.5" aria-label="Credits" value={r.credits} onChange={(e) => update(r.key, { credits: Math.max(0, Number(e.target.value) || 0) })} className={cn(inputCls, "w-[96px]")} />
                        {r.kind === "pm" && r.credits !== suggestedPm && (
                          <button type="button" onClick={() => update(r.key, { credits: suggestedPm })} className="self-start text-[12px] underline underline-offset-2">
                            Use {fmt(suggestedPm)} ({Math.round(pmLine.percent * 100)}% of creative)
                          </button>
                        )}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={cn("inline-flex h-[34px] items-center text-[12px]", balanceOf(r) === "pm" ? "text-ds-text" : "text-ds-text-2")}>{balanceOf(r) === "pm" ? "PM" : "Creative"}</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className="inline-flex h-[34px] items-center">
                      {r.orig && r.orig.credits !== credits && <span className="mr-1.5 text-ds-text-3 line-through">{fmt(r.orig.credits)}</span>}
                      {fmt(credits)}
                    </span>
                  </td>
                  <td className="px-6 py-2.5">
                    <button type="button" aria-label={`Remove ${name}`} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} className="flex size-8 items-center justify-center rounded-[8px] text-ds-text-2 hover:bg-ds-subtle hover:text-ds-text">
                      <Trash2 className="size-4" strokeWidth={1.75} />
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-ds-divider">
              <td colSpan={6} className="px-6 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <select aria-label="Item from the price list" value={adding} onChange={(e) => setAdding(e.target.value)} className={cn(inputCls, "h-8 max-w-[360px] text-[13px]")}>
                    <option value="">Choose from the price list…</option>
                    {categories.map((c) => (
                      <optgroup key={c} label={c}>
                        {priceList
                          .filter((p) => (p.category ?? "Other") === c)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} · {p.status === "quote" ? "quote" : `${fmt(p.creditCost ?? 0)} ${p.unit ?? ""}`}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!adding}
                    onClick={() => {
                      setRows((rs) => [...rs, { key: `new-${Date.now()}`, kind: "price", itemId: adding, quantity: 1, detail: "", credits: null, confirmed: false }]);
                      setAdding("");
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-dashed border-ds-dashed bg-white px-2.5 text-[13px] font-medium text-ds-text disabled:opacity-50"
                  >
                    <Plus className="size-3.5" strokeWidth={2} />
                    Add line
                  </button>
                  <button type="button" onClick={() => setRows((rs) => [...rs, { key: `custom-${Date.now()}`, kind: "custom", deliverable: "", detail: "", quantity: 1, credits: 0, reason: "", balance: "creative", taskType: null, hours: null }])} className="h-8 rounded-[8px] px-2.5 text-[13px] font-medium text-ds-text hover:bg-ds-subtle">
                    Add PM quote
                  </button>
                  {!rows.some((r) => r.kind === "pm") && (
                    <button type="button" onClick={() => setRows((rs) => [...rs, { key: `pm-${Date.now()}`, kind: "pm", credits: suggestedPm, detail: "" }])} className="h-8 rounded-[8px] px-2.5 text-[13px] font-medium text-ds-text hover:bg-ds-subtle">
                      Add PM line
                    </button>
                  )}
                </div>
              </td>
            </tr>
            {needs.map((n, i) =>
              n.resolved ? null : (
                <tr key={`need-${i}`} className="border-t border-ds-divider bg-ds-watch-tint/50">
                  <td className="px-6 py-2.5" colSpan={2}>
                    <div className="flex flex-col">
                      <span className="font-medium text-ds-text">{n.description}</span>
                      <span className="text-[12px] text-ds-watch-text">Needs PM quote · {n.reason ?? "not on the price list"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5" colSpan={4}>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <input type="number" min={0} step="0.5" aria-label={`Credits for ${n.description}`} placeholder="Credits" value={resolutions[i]?.kind === "priced" ? (resolutions[i]?.credits ?? "") : ""} onChange={(e) => setResolutions((r) => ({ ...r, [i]: { kind: "priced", credits: Math.max(0, Number(e.target.value) || 0) } }))} className={cn(inputCls, "w-[96px]")} />
                      <button type="button" onClick={() => setResolutions((r) => ({ ...r, [i]: { kind: "excluded" } }))} className={cn("h-8 rounded-[8px] px-2.5 text-[13px] font-medium", resolutions[i]?.kind === "excluded" ? "bg-ds-text text-white" : "text-ds-text hover:bg-ds-subtle")}>
                        {resolutions[i]?.kind === "excluded" ? "Excluded" : "Exclude"}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
            <tr className="border-t border-ds-border bg-ds-subtle-2">
              <td colSpan={4} className="px-6 py-3.5 text-ds-text">
                <span className="font-semibold">Total</span> <span className="text-[13px] text-ds-text-2">· PM {fmt(pm)} · Creative {fmt(creative)}</span>
              </td>
              <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-ds-text">
                {total !== origTotal && <span className="mr-1.5 font-medium text-ds-text-3 line-through">{fmt(origTotal)}</span>}
                {fmt(total)}
              </td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-col gap-2 border-t border-ds-divider px-6 pb-5 pt-4">
        <label htmlFor="estimate-reason" className="text-[13px] font-medium text-ds-text">
          Reason for the client{clientHasVersion ? " (required)" : " (optional on a draft)"}
        </label>
        <input id="estimate-reason" name="reason" value={reason} onChange={(e) => setReason(e.target.value)} required={clientHasVersion} placeholder="What changed and why, in words the client will read" className="h-[38px] rounded-[8px] border border-ds-control-border px-3 text-[14px] outline-none focus:border-ds-text-3" />
        {unconfirmed > 0 && (
          <p className="m-0 text-[13px] text-ds-watch-text">
            {unconfirmed} line{unconfirmed === 1 ? " needs" : "s need"} your number before this can go to the client.
          </p>
        )}
        {state.error && <p className="m-0 text-[13px] text-ds-danger-text">{state.error}</p>}
        {state.ok && <p className="m-0 text-[13px] text-ds-success-text">{state.ok}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <span className="min-w-0 flex-1 text-[12px] text-ds-text-2">Logged as a PM override on the Estimate agent&apos;s decision. Credits are worked out on the server.</span>
          <Button asChild variant="secondary" size="md">
            <Link href={cancelHref} scroll={false}>
              Cancel
            </Link>
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={pending}>
            {clientHasVersion ? `Send v${version + 1} to client` : "Save draft"}
          </Button>
        </div>
      </div>
    </form>
  );
}
