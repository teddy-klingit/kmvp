import Link from "next/link";
import { loadAiUsage, type Period } from "@/lib/ai-usage-admin";
import { getSetting } from "@/lib/platform-settings";
import { offerTopUpAction, saveAiPlansAction, saveCostControlAction, saveTopUpRulesAction } from "@/lib/actions/ai-usage-actions";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { cn } from "@/lib/utils";

const usd = (n: number, d = 2) => `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
const eur = (n: number) => `€${Math.round(n).toLocaleString("en-GB")}`;
const MODEL_LABEL: Record<string, string> = { "claude-sonnet-5-5": "Claude Sonnet", "claude-haiku-5-5": "Claude Haiku", "claude-opus-5-5": "Claude Opus", "claude-opus-5": "Claude Opus 5", "gpt-image-1": "Image model" };
const MODEL_TONE = ["#B455B6", "#D9A6DA", "#BDB6A8", "#6E2F70", "#8D9E47"];
const input = "h-10 w-24 rounded-[10px] border border-[#CFC8B8] bg-white px-3 text-right text-[14px] tabular-nums outline-none focus:border-brand-ink";
const chip = (on: boolean) => cn("inline-flex h-9 cursor-pointer items-center rounded-full border px-3.5 text-[13px] has-[:checked]:border-brand-ink has-[:checked]:bg-brand-ink has-[:checked]:text-white", on ? "" : "border-[#DCD6C8] bg-white");

function Card({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[12px] bg-white">
      <header className="flex flex-wrap items-center gap-3 border-b border-brand-line px-6 py-4">
        <h2 className="m-0 flex-1 text-[18px] font-normal">{title}</h2>
        {right}
      </header>
      {children}
    </section>
  );
}
function Radio({ name, value, checked, label }: { name: string; value: string; checked: boolean; label: string }) {
  return (
    <label className={chip(checked)}>
      <input type="radio" name={name} value={value} defaultChecked={checked} className="sr-only" />
      {label}
    </label>
  );
}

/**
 * Admin → AI usage (Phase U, design AdminAIUsage): what each plan may cost us, this month's cost and the real cost per
 * credit, usage by client with Offer top-up, where the cost goes, the top-up rules and cost control. Placeholders.
 */
export default async function AiUsagePage({ searchParams }: { searchParams: Promise<{ period?: string; ok?: string }> }) {
  const q = await searchParams;
  const period: Period = q.period === "last" || q.period === "year" ? q.period : "month";
  const [u, warnAt, at100, approval, maxPerMonth, rollover, options, prices, routing, caching, batch, fairUse] = await Promise.all([
    loadAiUsage(period),
    getSetting("aiWarnAt"),
    getSetting("aiAt100"),
    getSetting("topUpApproval"),
    getSetting("topUpMaxEurPerMonth"),
    getSetting("topUpRollover"),
    getSetting("aiTopUpOptions"),
    getSetting("aiPrices"),
    getSetting("aiRouting"),
    getSetting("promptCaching"),
    getSetting("batchScheduledReports"),
    getSetting("assistantFairUsePerDay"),
  ]);
  const month = new Intl.DateTimeFormat("en-GB", { month: "long" }).format(period === "last" ? new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1) : new Date());
  const maxSkill = Math.max(0.0001, ...u.skills.map((s) => s.costUsd), u.assistants.costUsd);

  return (
    <div className="flex flex-col gap-6">
      {q.ok && <p className="m-0 rounded-[10px] bg-white px-4 py-3 text-[14px]">{q.ok}</p>}

      <Card title="How much AI each plan may cost us" right={<PlaceholderTag>All numbers placeholders</PlaceholderTag>}>
        <form action={saveAiPlansAction} className="flex flex-col gap-4 px-6 py-5">
          <div className="flex flex-wrap items-center gap-3 rounded-[10px] bg-brand-page px-4 py-3 text-[14px]">
            1 AI credit = <input name="usdPerCredit" defaultValue={u.usdPerCredit} className={cn(input, "w-20")} aria-label="Dollars per credit" /> of AI cost (Claude, image models…)
            <span className="ml-auto text-[13px] text-brand-ink-2">So $10 of AI = {Math.round(10 / u.usdPerCredit).toLocaleString("en-GB")} credits</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[14px]">
              <thead>
                <tr className="text-left font-brand-mono text-[11px] uppercase tracking-[0.06em] text-brand-ink-2">
                  <th className="py-2 font-normal">Plan</th>
                  <th className="py-2 font-normal">Price</th>
                  <th className="py-2 font-normal">AI budget / month</th>
                  <th className="py-2 font-normal">= AI credits</th>
                  <th className="py-2 font-normal">AI share of price</th>
                </tr>
              </thead>
              <tbody>
                {u.plans.map((p) => (
                  <tr key={p.key} className="border-t border-brand-line">
                    <td className="py-2.5">{p.name}</td>
                    <td className="py-2.5 tabular-nums">{eur(p.priceEur)}</td>
                    <td className="py-2.5">
                      <input name={`budget_${p.key}`} defaultValue={p.budgetUsd} aria-label={`${p.name} AI budget in dollars`} className={input} />
                    </td>
                    <td className="py-2.5 tabular-nums">{p.credits.toLocaleString("en-GB")}</td>
                    <td className="py-2.5 tabular-nums">{p.share != null ? `≈ ${Math.round(p.share * 100)}%` : "–"}</td>
                  </tr>
                ))}
                {u.topUp && (
                  <tr className="border-t border-brand-line">
                    <td className="py-2.5">Top-up</td>
                    <td className="py-2.5 tabular-nums">{eur(u.topUp.priceEur)}</td>
                    <td className="py-2.5 tabular-nums text-brand-ink-2">{usd(u.topUp.budgetUsd, 0)}</td>
                    <td className="py-2.5 tabular-nums">{u.topUp.credits.toLocaleString("en-GB")}</td>
                    <td className="py-2.5 tabular-nums">
                      ≈ {Math.round(u.topUp.share * 100)}% · sold at {u.topUp.markup.toFixed(1)}× cost
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <button type="submit" className="self-start h-10 rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white">
            Save budgets
          </button>
        </form>
      </Card>

      <section aria-label="This month" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: `AI cost ${period === "year" ? "12 months" : period === "last" ? "last month" : "this month"}`, value: usd(u.tiles.costUsd), note: `Skills ${usd(u.tiles.skillsUsd)} · assistants ${usd(u.tiles.assistantsUsd)}` },
          { label: "Real cost per credit", value: u.tiles.costPerCredit != null ? usd(u.tiles.costPerCredit, 4) : "–", note: u.tiles.costPerCredit == null ? "No charged runs yet" : u.tiles.costPerCredit <= u.usdPerCredit ? `Below the ${usd(u.usdPerCredit)} we assume. Good.` : `Above the ${usd(u.usdPerCredit)} we assume: check pricing.`, warn: u.tiles.costPerCredit != null && u.tiles.costPerCredit > u.usdPerCredit },
          { label: "Top-ups sold", value: eur(u.tiles.topUpsSold), note: `${u.tiles.topUpsCount} top-up${u.tiles.topUpsCount === 1 ? "" : "s"} · cost us ${usd(u.tiles.topUpsCostUsd, 0)}` },
          { label: "Close to the ceiling", value: `${u.tiles.over80.length} client${u.tiles.over80.length === 1 ? "" : "s"}`, note: `Over ${Math.round(warnAt * 100)}% of their credits`, warn: u.tiles.over80.length > 0 },
        ].map((t) => (
          <div key={t.label} className="flex flex-col gap-1 rounded-[12px] bg-white px-5 py-5">
            <span className="text-[13px] text-brand-ink-2">{t.label}</span>
            <span className={cn("text-[28px] font-light tabular-nums", t.warn && "text-[#C2410C]")}>{t.value}</span>
            <span className="text-[12px] text-brand-ink-2">{t.note}</span>
          </div>
        ))}
      </section>

      <Card
        title={`Usage by client · ${period === "year" ? "12 months" : month}`}
        right={
          <span className="flex gap-2">
            {(
              [
                ["month", "This month"],
                ["last", "Last month"],
                ["year", "12 months"],
              ] as const
            ).map(([k, l]) => (
              <Link key={k} href={`/ops/admin/ai-usage?period=${k}`} className={cn("inline-flex h-9 items-center rounded-full border px-3.5 text-[13px] no-underline", period === k ? "border-brand-ink bg-brand-ink text-white" : "border-[#DCD6C8] bg-white text-brand-ink")}>
                {l}
              </Link>
            ))}
          </span>
        }
      >
        {u.clients.length === 0 ? (
          <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">No AI use in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-[14px]">
              <thead>
                <tr className="text-left font-brand-mono text-[11px] uppercase tracking-[0.06em] text-brand-ink-2">
                  <th className="px-6 py-2.5 font-normal">Client</th>
                  <th className="px-3 py-2.5 font-normal">Plan</th>
                  <th className="px-3 py-2.5 font-normal">AI credits this month</th>
                  <th className="px-3 py-2.5 font-normal">AI cost</th>
                  <th className="px-3 py-2.5 font-normal">Top-ups</th>
                  <th className="px-6 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {u.clients.map((c) => {
                  const hot = c.pct >= warnAt * 100;
                  return (
                    <tr key={c.id} className="border-t border-brand-line align-middle">
                      <td className="px-6 py-3">
                        <span className="block">{c.name}</span>
                        {c.note && <span className="text-[12px] text-brand-ink-2">{c.note}</span>}
                      </td>
                      <td className="px-3 py-3">
                        <span className="rounded-[6px] bg-brand-page px-2 py-0.5 text-[12px]">{c.plan}</span>
                      </td>
                      <td className="w-[280px] px-3 py-3">
                        <span className={cn("flex justify-between text-[13px]", hot && "text-brand-orange-text")}>
                          <span>
                            {c.used.toLocaleString("en-GB")} of {c.of.toLocaleString("en-GB")} credits
                          </span>
                          <span>{c.pct}%</span>
                        </span>
                        <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-brand-track">
                          <span className={cn("block h-full rounded-full", hot ? "bg-brand-orange" : "bg-[#B455B6]")} style={{ width: `${Math.min(100, c.pct)}%` }} />
                        </span>
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {usd(c.costUsd)} <span className="text-[12px] text-brand-ink-2">of {usd(c.budgetUsd, 0)}</span>
                      </td>
                      <td className="px-3 py-3 tabular-nums">{c.topUps ? `${c.topUps} · ${c.currency === "EUR" ? eur(c.topUpsAmount) : `${c.topUpsAmount} ${c.currency}`}` : "–"}</td>
                      <td className="px-6 py-3 text-right">
                        {hot ? (
                          <form action={offerTopUpAction}>
                            <input type="hidden" name="clientId" value={c.id} />
                            <button type="submit" className="h-9 rounded-full bg-brand-ink px-3.5 font-brand-mono text-[12px] text-white">
                              Offer top-up
                            </button>
                          </form>
                        ) : (
                          <Link href={`/ops/clients/${c.id}/dashboard`} className="inline-flex h-9 items-center rounded-full border border-[#CFC8B8] px-3.5 font-brand-mono text-[12px] text-brand-ink no-underline">
                            Open
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card title="Where the AI cost goes">
          <div className="flex flex-col gap-3 px-6 py-5">
            {u.skills.length === 0 && u.assistants.costUsd === 0 && <p className="m-0 text-[14px] text-brand-ink-2">No AI cost in this period.</p>}
            {u.skills.slice(0, 8).map((s) => (
              <div key={s.name} className="grid grid-cols-[150px_minmax(0,1fr)_70px] items-center gap-3 text-[14px]">
                <span className="flex flex-col">
                  {s.name}
                  <span className="text-[11px] text-brand-ink-2">{s.images ? `${s.images} images` : `${s.runs} runs`}</span>
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-transparent">
                  <span className="block h-full rounded-full bg-[#B455B6]" style={{ width: `${(s.costUsd / maxSkill) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">{usd(s.costUsd)}</span>
              </div>
            ))}
            {u.assistants.costUsd > 0 && (
              <div className="grid grid-cols-[150px_minmax(0,1fr)_70px] items-center gap-3 text-[14px]">
                <span className="flex flex-col">
                  Assistants (free for clients)
                  <span className="text-[11px] text-brand-ink-2">{u.assistants.names.slice(0, 3).join(", ").toLowerCase()}</span>
                </span>
                <span className="h-2 overflow-hidden rounded-full">
                  <span className="block h-full rounded-full bg-[repeating-linear-gradient(135deg,#BDB6A8_0_3px,#E9E3D6_3px_6px)]" style={{ width: `${(u.assistants.costUsd / maxSkill) * 100}%` }} />
                </span>
                <span className="text-right tabular-nums">{usd(u.assistants.costUsd)}</span>
              </div>
            )}
            {u.models.length > 0 && (
              <div className="mt-2 flex flex-col gap-2 border-t border-brand-line pt-3">
                <span className="text-[14px]">By model</span>
                <span className="flex h-3 overflow-hidden rounded-full">
                  {u.models.map((m, i) => (
                    <span key={m.model} style={{ width: `${m.share * 100}%`, background: MODEL_TONE[i % MODEL_TONE.length] }} />
                  ))}
                </span>
                <span className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-brand-ink-2">
                  {u.models.map((m, i) => (
                    <span key={m.model} className="flex items-center gap-1.5">
                      <span className="size-2.5 rounded-[3px]" style={{ background: MODEL_TONE[i % MODEL_TONE.length] }} />
                      {MODEL_LABEL[m.model] ?? m.model} {Math.round(m.share * 100)}%
                    </span>
                  ))}
                </span>
              </div>
            )}
          </div>
        </Card>

        <Card title="Top-up rules">
          <form action={saveTopUpRulesAction} className="flex flex-col gap-4 px-6 py-5 text-[14px]">
            <label className="flex items-center justify-between gap-3">
              Warn the client at <input name="warnAt" defaultValue={`${Math.round(warnAt * 100)}%`} className={cn(input, "w-20")} />
            </label>
            <div className="flex items-start justify-between gap-3">
              <span>At 100%: skills</span>
              <span className="flex flex-wrap justify-end gap-2">
                <Radio name="at100" value="pause" checked={at100 === "pause"} label="Pause" />
                <Radio name="at100" value="bill" checked={at100 === "bill"} label="Keep running, bill overage" />
              </span>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span>Top-ups added</span>
              <span className="flex flex-wrap justify-end gap-2">
                <Radio name="approval" value="instant" checked={approval === "instant"} label="Instantly" />
                <Radio name="approval" value="staff" checked={approval === "staff"} label="After staff approval" />
              </span>
            </div>
            <label className="flex items-center justify-between gap-3">
              Max top-ups per client / month <input name="maxPerMonth" defaultValue={`€${maxPerMonth}`} className={cn(input, "w-24")} />
            </label>
            <div className="flex items-center justify-between gap-3">
              <span>Top-up credits roll over</span>
              <span className="flex gap-2">
                <Radio name="rollover" value="yes" checked={rollover} label="Yes" />
                <Radio name="rollover" value="no" checked={!rollover} label="No" />
              </span>
            </div>
            <div className="flex flex-col gap-2 border-t border-brand-line pt-3">
              <span className="text-[13px] text-brand-ink-2">Options (credits · €)</span>
              {options.map((o, i) => (
                <span key={i} className="flex items-center gap-2">
                  <input name={`credits_${i}`} defaultValue={o.credits} aria-label={`Option ${i + 1} credits`} className={cn(input, "w-24")} />
                  <input name={`price_${i}`} defaultValue={o.priceEur} aria-label={`Option ${i + 1} price in euro`} className={cn(input, "w-20")} />
                </span>
              ))}
            </div>
            <button type="submit" className="self-start h-10 rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white">
              Save rules
            </button>
            <p className="m-0 text-[12px] text-brand-ink-2">Assistants never stop: they are free for clients, with a fair-use limit of {fairUse} calls a day.</p>
          </form>
        </Card>
      </div>

      <Card title="Cost control" right={<span className="text-[12px] text-brand-ink-2">Prices in $ per million tokens</span>}>
        <form action={saveCostControlAction} className="grid grid-cols-1 gap-5 px-6 py-5 text-[14px] lg:grid-cols-2">
          <div className="flex flex-col gap-2">
            {Object.entries(prices.models).map(([m, p]) => (
              <span key={m} className="flex items-center gap-2">
                <span className="flex-1">{MODEL_LABEL[m] ?? m}</span>
                in <input name={`in_${m}`} defaultValue={p.in} className={cn(input, "w-16")} aria-label={`${m} input price`} />
                out <input name={`out_${m}`} defaultValue={p.out} className={cn(input, "w-16")} aria-label={`${m} output price`} />
              </span>
            ))}
            <span className="flex items-center gap-2">
              <span className="flex-1">Per image · per web search</span>
              <input name="image" defaultValue={prices.image} className={cn(input, "w-16")} aria-label="Price per image" />
              <input name="webSearch" defaultValue={prices.webSearch} className={cn(input, "w-16")} aria-label="Price per web search" />
            </span>
            <span className="flex items-center gap-2">
              <span className="flex-1">EUR → USD</span>
              <input name="eurUsd" defaultValue={u.eurUsd} className={cn(input, "w-16")} aria-label="EUR to USD rate" />
            </span>
          </div>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              Simple skills on Haiku (keys)
              <textarea name="simpleSkills" defaultValue={routing.simpleSkills.join(", ")} rows={2} className="rounded-[10px] border border-[#CFC8B8] px-3 py-2 text-[13px]" />
            </label>
            <label className="flex flex-col gap-1">
              Skills on Opus (keys; everything else runs on Sonnet)
              <textarea name="opusSkills" defaultValue={routing.opusSkills.join(", ")} rows={2} className="rounded-[10px] border border-[#CFC8B8] px-3 py-2 text-[13px]" />
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="caching" defaultChecked={caching} /> Cache the Brand OS in prompts
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="batch" defaultChecked={batch} /> Scheduled reports through the Batch API (half price, within hours)
            </label>
            <button type="submit" className="self-start h-10 rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white">
              Save cost control
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
