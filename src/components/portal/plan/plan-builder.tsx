"use client";

import { useActionState, useMemo, useState } from "react";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { submitRequestAction, type PlanRequestState } from "@/lib/actions/plan-request-actions";
import { cn } from "@/lib/utils";

export type BuilderPlan = { key: string; name: string; tagline: string | null; aiCredits: number; ownModel: boolean; features: string[] };
export type BuilderPack = { key: string; name: string; pm: number; creative: number; slots: number };
/** Monthly prices by `${plan}|${pack ?? "none"}|${term}`, in the contract's currency, from the pricing library. */
export type PriceMatrix = Record<string, { platform: number; team: number | null; total: number | null }>;

const TERMS = [3, 6, 12, 18];

/**
 * Change plan or pack (Phase S, the pricing page's layout A inside the app): pick the platform, add Klingit's team (a
 * PM pack, or PM + creative), pick the commitment, see the new monthly price against today's, and send it as a
 * request. Team packs need Enterprise. Members see it read-only.
 */
export function PlanBuilder({ plans, packs, prices, current, currency, admin, today }: { plans: BuilderPlan[]; packs: BuilderPack[]; prices: PriceMatrix; current: { planKey: string; packKey: string | null; term: number }; currency: string; admin: boolean; today: number | null }) {
  const [planKey, setPlanKey] = useState(current.planKey);
  const [team, setTeam] = useState(Boolean(current.packKey));
  const [packKey, setPackKey] = useState(current.packKey ?? packs.find((p) => p.creative > 0)?.key ?? packs[0]?.key ?? null);
  const [term, setTerm] = useState(current.term);
  const [state, action, pending] = useActionState<PlanRequestState, FormData>(submitRequestAction, {});
  const fmt = (n: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  const effectivePlan = team ? "enterprise" : planKey;
  const price = prices[`${effectivePlan}|${team ? packKey : "none"}|${term}`];
  const pack = packs.find((p) => p.key === packKey);
  const unchanged = effectivePlan === current.planKey && (team ? packKey : null) === current.packKey;
  const payload = useMemo(() => JSON.stringify({ platformPlanKey: effectivePlan, teamPackKey: team ? packKey : null, months: term }), [effectivePlan, team, packKey, term]);
  const groups = [
    { label: "Marketing PM", items: packs.filter((p) => p.creative === 0) },
    { label: "Marketing PM + creative team", items: packs.filter((p) => p.creative > 0) },
  ];

  return (
    <form action={action} className="grid grid-cols-1 gap-6 px-6 py-5 min-[1000px]:grid-cols-[minmax(0,1fr)_300px]">
      <input type="hidden" name="kind" value="plan_change" />
      <input type="hidden" name="payload" value={payload} />
      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-3">
          <span className="font-brand-mono text-[11px] uppercase text-brand-ink-2">Step 1 · Platform</span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Platform plan">
            {plans.map((p) => {
              const on = effectivePlan === p.key;
              const locked = team && p.key !== "enterprise";
              return (
                <button key={p.key} type="button" role="radio" aria-checked={on} disabled={!admin || locked} onClick={() => setPlanKey(p.key)} className={cn("flex flex-col gap-2 rounded-[12px] border bg-white p-4 text-left", on ? "border-brand-ink shadow-[inset_0_0_0_1px_#1E1E1E]" : "border-brand-line", locked && "opacity-50")}>
                  <span className="flex items-center gap-2">
                    <span className="flex-1 text-[17px]">{p.name}</span>
                    {p.key === current.planKey && <span className="text-[11px] text-brand-ink-2">today</span>}
                  </span>
                  <span className="text-[20px] tabular-nums">
                    {fmt(prices[`${p.key}|none|${term}`]?.platform ?? 0)} <span className="text-[12px] text-brand-ink-2">/ month</span>
                  </span>
                  <span className="rounded-[8px] bg-brand-page px-2.5 py-1.5 text-[12px]">{p.ownModel ? "Your own AI (Claude via MCP or your key)" : `${p.aiCredits.toLocaleString("en-GB")} AI credits a month`}</span>
                  <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[12px] text-brand-ink-2">
                    {p.features.slice(0, 4).map((f) => (
                      <li key={f}>· {f}</li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <span className="font-brand-mono text-[11px] uppercase text-brand-ink-2">Step 2 · Klingit&apos;s team</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Team">
            {[
              [false, "Platform only"],
              [true, "Add Klingit's team (Enterprise)"],
            ].map(([v, l]) => (
              <button key={String(v)} type="button" role="radio" aria-checked={team === v} disabled={!admin} onClick={() => setTeam(v as boolean)} className={cn("h-9 rounded-full border px-4 text-[14px]", team === v ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline bg-white")}>
                {l as string}
              </button>
            ))}
          </div>
          {team && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {groups.map((g) => (
                <div key={g.label} className="flex flex-col gap-2">
                  <span className="text-[13px] text-brand-ink-2">{g.label}</span>
                  {g.items.map((p) => (
                    <label key={p.key} className={cn("flex cursor-pointer items-center gap-3 rounded-[10px] border bg-white px-3 py-2.5 text-[14px]", packKey === p.key ? "border-brand-ink" : "border-brand-line")}>
                      <input type="radio" name="packPick" checked={packKey === p.key} disabled={!admin} onChange={() => setPackKey(p.key)} className="accent-[#1E1E1E]" />
                      <span className="flex flex-1 flex-col">
                        <span>{p.name}</span>
                        <span className="text-[12px] text-brand-ink-2">
                          {p.slots} project{p.slots === 1 ? "" : "s"} at once · contact person included
                        </span>
                      </span>
                      <span className="tabular-nums">{fmt(prices[`enterprise|${p.key}|${term}`]?.team ?? 0)}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13px] text-brand-ink-2">Commitment</span>
            {TERMS.map((t) => (
              <button key={t} type="button" disabled={!admin} onClick={() => setTerm(t)} aria-pressed={term === t} className={cn("h-8 rounded-full border px-3 text-[13px]", term === t ? "border-brand-ink bg-brand-ink text-white" : "border-brand-outline bg-white")}>
                {t} months
              </button>
            ))}
          </div>
        </div>
      </div>

      <aside className="flex flex-col gap-3 self-start rounded-[16px] bg-brand-ink p-5 text-white">
        <span className="font-brand-mono text-[11px] uppercase opacity-70">New monthly price</span>
        <span className="flex justify-between text-[14px]">
          <span>{plans.find((p) => p.key === effectivePlan)?.name} platform</span>
          <span className="tabular-nums">{price ? fmt(price.platform) : "—"}</span>
        </span>
        {team && pack && (
          <span className="flex justify-between text-[14px]">
            <span>
              {pack.name}
              <span className="block text-[12px] opacity-70">
                PM {pack.pm}
                {pack.creative ? ` + creative ${pack.creative}` : ""} credits a month
              </span>
            </span>
            <span className="tabular-nums">{price?.team != null ? fmt(price.team) : "—"}</span>
          </span>
        )}
        <span className="border-t border-white/25 pt-3 text-[34px] font-light tabular-nums">{price?.total != null ? fmt(price.total) : "—"}</span>
        <span className="text-[12px] opacity-70">
          per month · {term} months{today != null && price?.total != null ? ` · today ${fmt(today)}` : ""}
        </span>
        <span className="text-[12px] leading-[1.5] opacity-80">Upgrades start 7 days after Klingit approves and run at least 3 months, at that length&apos;s price. Downgrades: once a month, with a month&apos;s notice.</span>
        {admin && (
          <button type="submit" disabled={pending || unchanged} className="h-11 rounded-full bg-brand-orange font-brand-mono text-[13px] text-brand-ink disabled:opacity-50">
            {pending ? "Sending…" : unchanged ? "That's your plan today" : "Ask for this plan"}
          </button>
        )}
        {(state.error || state.ok) && <span className={cn("text-[13px]", state.error ? "text-[#FFB38A]" : "")}>{state.error ?? state.ok}</span>}
        <PlaceholderTag className="self-start border-white/60 text-white">Prices</PlaceholderTag>
      </aside>
    </form>
  );
}
