"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ds/button";
import { saveEstimateAction, type CockpitState } from "@/lib/actions/cockpit-actions";
import { cn } from "@/lib/utils";

type Tier = "LOW" | "MEDIUM" | "HIGH";
const TIER_LABEL: Record<Tier, string> = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

export type PriceRow = { deliverableType: string; complexityTier: Tier; creditCost: number; displayName: string | null };
export type EditorLine = {
  id: string;
  deliverable: string;
  detail: string;
  quantity: number;
  complexityTier: Tier | null;
  credits: number;
  isCustom: boolean;
  customReason: string | null;
  priceListItemId: string | null;
};
export type EditorNeed = { description: string; reason?: string; resolved: boolean };

type Row =
  | { key: string; kind: "price"; deliverableType: string; tier: Tier; quantity: number; detail: string; orig?: { credits: number; tier: Tier | null; quantity: number } }
  | { key: string; kind: "custom"; deliverable: string; detail: string; quantity: number; credits: number; reason: string; orig?: { credits: number; tier: Tier | null; quantity: number } };

const inputCls = "h-[34px] rounded-[8px] border border-ds-control-border bg-white px-2.5 text-[14px] outline-none focus:border-ds-text-3";

export function EstimateEditor({
  projectId,
  lines,
  priceList,
  needs,
  clientHasVersion,
  clientFirstName,
  version,
  cancelHref,
}: {
  projectId: string;
  lines: EditorLine[];
  priceList: PriceRow[];
  needs: EditorNeed[];
  clientHasVersion: boolean;
  clientFirstName: string;
  version: number;
  cancelHref: string;
}) {
  const [state, action, pending] = useActionState<CockpitState, FormData>(saveEstimateAction, {});
  const [rows, setRows] = useState<Row[]>(() =>
    lines.map((l) =>
      l.isCustom || !l.priceListItemId || !l.complexityTier
        ? { key: l.id, kind: "custom" as const, deliverable: l.deliverable, detail: l.detail, quantity: l.quantity, credits: l.credits, reason: l.customReason ?? "", orig: { credits: l.credits, tier: l.complexityTier, quantity: l.quantity } }
        : { key: l.id, kind: "price" as const, deliverableType: l.deliverable, tier: l.complexityTier, quantity: l.quantity, detail: l.detail, orig: { credits: l.credits, tier: l.complexityTier, quantity: l.quantity } }
    )
  );
  const [resolutions, setResolutions] = useState<Record<number, { kind: "priced" | "excluded"; credits?: number }>>({});
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState("");

  const types = useMemo(() => [...new Set(priceList.map((p) => p.deliverableType))], [priceList]);
  const row = (type: string, tier: Tier) => priceList.find((p) => p.deliverableType === type && p.complexityTier === tier);
  const tiersFor = (type: string) => priceList.filter((p) => p.deliverableType === type).map((p) => p.complexityTier);
  const creditsOf = (r: Row) => (r.kind === "price" ? (row(r.deliverableType, r.tier)?.creditCost ?? 0) * r.quantity : r.credits);
  const pricedNeeds = Object.values(resolutions).reduce((n, r) => n + (r.kind === "priced" ? (r.credits ?? 0) : 0), 0);
  const total = rows.reduce((n, r) => n + creditsOf(r), 0) + pricedNeeds;
  const origTotal = lines.reduce((n, l) => n + l.credits, 0);

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? ({ ...r, ...patch } as Row) : r)));
  const payload = rows.map((r) =>
    r.kind === "price"
      ? { kind: "price", deliverableType: r.deliverableType, complexityTier: r.tier, quantity: r.quantity, detail: r.detail }
      : { kind: "custom", deliverable: r.deliverable, detail: r.detail, quantity: r.quantity, complexityTier: null, credits: r.credits, reason: r.reason }
  );
  const resolutionPayload = Object.entries(resolutions).map(([index, r]) => ({ index: Number(index), ...r }));

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
        <table className="w-full min-w-[720px] border-collapse text-[14px]">
          <thead>
            <tr className="text-left text-[12px] text-ds-text-2">
              <th scope="col" className="px-6 py-2.5 font-medium">Deliverable</th>
              <th scope="col" className="w-[96px] px-3 py-2.5 font-medium">Quantity</th>
              <th scope="col" className="w-[140px] px-3 py-2.5 font-medium">Complexity</th>
              <th scope="col" className="w-[96px] px-3 py-2.5 text-right font-medium">Credits</th>
              <th scope="col" className="w-[56px] px-6 py-2.5">
                <span className="sr-only">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const credits = creditsOf(r);
              const tierChanged = r.kind === "price" && r.orig && r.orig.tier !== r.tier;
              const qtyChanged = r.orig && r.orig.quantity !== r.quantity;
              const changed = !r.orig || r.orig.credits !== credits || tierChanged || qtyChanged;
              const name = r.kind === "price" ? (row(r.deliverableType, r.tier)?.displayName ?? r.deliverableType) : r.deliverable;
              return (
                <tr key={r.key} className={cn("border-t border-ds-divider align-top", changed && "bg-ds-note")}>
                  <td className="px-6 py-2.5">
                    <div className="flex flex-col gap-1">
                      {r.kind === "custom" ? (
                        <input aria-label="Deliverable" value={r.deliverable} onChange={(e) => update(r.key, { deliverable: e.target.value })} className={cn(inputCls, "font-medium")} />
                      ) : (
                        <span className="font-medium text-ds-text">{name}</span>
                      )}
                      <input aria-label="Details" value={r.detail} placeholder="Details the client sees" onChange={(e) => update(r.key, { detail: e.target.value })} className={cn(inputCls, "h-8 text-[13px] text-ds-text-2")} />
                      {r.kind === "custom" && (
                        <input aria-label="Reason for this custom line" value={r.reason} placeholder="Why it's priced by hand (required)" onChange={(e) => update(r.key, { reason: e.target.value })} className={cn(inputCls, "h-8 text-[13px]")} />
                      )}
                      {r.orig && (tierChanged || qtyChanged) && (
                        <span className="text-[12px] text-ds-watch-text">
                          Changed:{" "}
                          {[
                            tierChanged && r.orig.tier ? `${TIER_LABEL[r.orig.tier]} → ${TIER_LABEL[(r as { tier: Tier }).tier]}` : null,
                            qtyChanged ? `quantity ${r.orig.quantity} → ${r.quantity}` : null,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </span>
                      )}
                      {!r.orig && <span className="text-[12px] text-ds-watch-text">New line</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      min={1}
                      aria-label="Quantity"
                      value={r.quantity}
                      onChange={(e) => update(r.key, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                      className={cn(inputCls, "w-[72px]")}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    {r.kind === "price" ? (
                      <select
                        aria-label="Complexity"
                        value={r.tier}
                        onChange={(e) => update(r.key, { tier: e.target.value as Tier })}
                        className={cn(inputCls, "w-[120px]", tierChanged && "border-ds-watch-border")}
                      >
                        {tiersFor(r.deliverableType).map((t) => (
                          <option key={t} value={t}>
                            {TIER_LABEL[t]}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        min={0}
                        aria-label="Credits"
                        value={r.credits}
                        onChange={(e) => update(r.key, { credits: Math.max(0, Number(e.target.value) || 0) })}
                        className={cn(inputCls, "w-[96px]")}
                      />
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span className="inline-flex h-[34px] items-center">
                      {r.orig && r.orig.credits !== credits && <span className="mr-1.5 text-ds-text-3 line-through">{r.orig.credits}</span>}
                      {credits}
                    </span>
                  </td>
                  <td className="px-6 py-2.5">
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      className="flex size-8 items-center justify-center rounded-[8px] text-ds-text-2 hover:bg-ds-subtle hover:text-ds-text"
                    >
                      <Trash2 className="size-4" strokeWidth={1.75} />
                    </button>
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-ds-divider">
              <td colSpan={5} className="px-6 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <select aria-label="Deliverable from the price list" value={adding} onChange={(e) => setAdding(e.target.value)} className={cn(inputCls, "h-8 text-[13px]")}>
                    <option value="">Choose from the price list…</option>
                    {types.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!adding}
                    onClick={() => {
                      const tiers = tiersFor(adding);
                      setRows((rs) => [...rs, { key: `new-${Date.now()}`, kind: "price", deliverableType: adding, tier: tiers.includes("MEDIUM") ? "MEDIUM" : tiers[0], quantity: 1, detail: "" }]);
                      setAdding("");
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-dashed border-ds-dashed bg-white px-2.5 text-[13px] font-medium text-ds-text disabled:opacity-50"
                  >
                    <Plus className="size-3.5" strokeWidth={2} />
                    Add line from price list
                  </button>
                  <button
                    type="button"
                    onClick={() => setRows((rs) => [...rs, { key: `custom-${Date.now()}`, kind: "custom", deliverable: "", detail: "", quantity: 1, credits: 0, reason: "" }])}
                    className="h-8 rounded-[8px] px-2.5 text-[13px] font-medium text-ds-text hover:bg-ds-subtle"
                  >
                    Add custom line
                  </button>
                </div>
              </td>
            </tr>
            {needs.map((n, i) =>
              n.resolved ? null : (
                <tr key={`need-${i}`} className="border-t border-ds-divider bg-ds-watch-tint/50">
                  <td className="px-6 py-2.5" colSpan={2}>
                    <div className="flex flex-col">
                      <span className="font-medium text-ds-text">{n.description}</span>
                      <span className="text-[12px] text-ds-watch-text">Out of scope · {n.reason ?? "not on the price list"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2.5" colSpan={3}>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <input
                        type="number"
                        min={0}
                        aria-label={`Credits for ${n.description}`}
                        placeholder="Credits"
                        value={resolutions[i]?.kind === "priced" ? (resolutions[i]?.credits ?? "") : ""}
                        onChange={(e) => setResolutions((r) => ({ ...r, [i]: { kind: "priced", credits: Math.max(0, Number(e.target.value) || 0) } }))}
                        className={cn(inputCls, "w-[96px]")}
                      />
                      <button
                        type="button"
                        onClick={() => setResolutions((r) => ({ ...r, [i]: { kind: "excluded" } }))}
                        className={cn("h-8 rounded-[8px] px-2.5 text-[13px] font-medium", resolutions[i]?.kind === "excluded" ? "bg-ds-text text-white" : "text-ds-text hover:bg-ds-subtle")}
                      >
                        {resolutions[i]?.kind === "excluded" ? "Excluded" : "Exclude"}
                      </button>
                    </div>
                  </td>
                </tr>
              )
            )}
            <tr className="border-t border-ds-border bg-ds-subtle-2">
              <td colSpan={3} className="px-6 py-3.5 font-semibold text-ds-text">
                Total
              </td>
              <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-ds-text">
                {total !== origTotal && <span className="mr-1.5 font-medium text-ds-text-3 line-through">{origTotal}</span>}
                {total}
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
        <input
          id="estimate-reason"
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required={clientHasVersion}
          placeholder="What changed and why, in words the client will read"
          className="h-[38px] rounded-[8px] border border-ds-control-border px-3 text-[14px] outline-none focus:border-ds-text-3"
        />
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
