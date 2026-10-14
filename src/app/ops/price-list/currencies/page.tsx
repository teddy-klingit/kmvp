import { prisma } from "@/lib/prisma";
import { requireOpsPage } from "@/lib/authz";
import { roleTierFor } from "@/lib/role-tier";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { Card, SectionCard, CardRows } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { PRICE_LIST_TABS } from "@/components/ops/price-list-tabs";
import { getSetting } from "@/lib/platform-settings";
import { aiTopUpPrice, CURRENCIES, formatMoney, loadPricing, monthlyPrice } from "@/lib/pricing";
import { saveFxRateAction, savePricingSettingsAction } from "@/lib/actions/ops-pricing-actions";

const field = "h-9 rounded-[8px] border border-brand-outline bg-white px-3 text-[14px] outline-none focus:border-brand-ink";
const pct = (f: number) => Math.round(f * 10000) / 100;

/**
 * Price List → Currencies & terms (Phase S): FX rates, the term and upfront adjustments, the AI credit conversion,
 * rollover, slots, the PM line, extra packs, AI top-ups, the assistants' fair-use limit and VAT. All placeholders,
 * all logged when changed. Admins edit; PMs read.
 */
export default async function CurrenciesPage() {
  const viewer = await requireOpsPage(["ADMIN", "PM"]);
  const admin = roleTierFor(viewer.title) === "ADMIN";
  const p = await loadPricing();
  const [rates, s] = await Promise.all([
    prisma.fxRate.findMany({ orderBy: { currency: "asc" } }),
    Promise.all(
      (["assistantFairUsePerDay", "aiTokensPerCredit", "teamRolloverCap", "aiRollover", "creativeCreditsPerSlot", "pmLinePercent", "pmLineMin", "creativePackSize", "creativePackSurcharge", "vatRateDomestic"] as const).map(async (k) => [k, await getSetting(k)] as const)
    ).then((e) => Object.fromEntries(e) as Record<string, number | boolean>),
  ]);
  // A worked example so the effect of a rate or adjustment is visible: Enterprise + PM + creative 20 + 40.
  const example = (term: number, upfront = false) => monthlyPrice(p, { planKey: "enterprise", packKey: "pmc20_40", term, upfront, currency: "EUR" }).total;

  return (
    <OpsPage>
      <PageHeader eyebrow="Rates, terms and the rules behind every price" title="Price List" tabsLabel="Price List sections" tabs={PRICE_LIST_TABS} />
      <Card tone="muted" className="flex flex-wrap items-center gap-3 px-6 py-4 text-[13px] leading-[1.5] text-brand-ink-2">
        <PlaceholderTag />
        <span className="min-w-0 flex-1">Every value here is a placeholder until pricing is decided. Changes apply to new prices and contracts at once; signed contracts keep their price.</span>
      </Card>

      <SectionCard title="Currencies" meta={<span className="text-[13px] text-brand-ink-2">Units per 1 EUR · price = EUR × rate × {1 + p.fxMarkup}, rounded to 5</span>}>
        <CardRows>
          {rates.map((r) => (
            <li key={r.currency} className="flex flex-wrap items-center gap-4 px-6 py-3 text-[14px]">
              <form action={saveFxRateAction} className="flex items-center gap-3">
                <input type="hidden" name="currency" value={r.currency} />
                <span className="w-10 font-brand-mono">{r.currency}</span>
                <input name="perEur" type="number" step="0.0001" min={0} defaultValue={r.perEur} readOnly={!admin} aria-label={`${r.currency} per EUR`} className={`${field} w-28`} />
                {admin && (
                  <button type="submit" className="text-[13px] underline underline-offset-2">
                    Save
                  </button>
                )}
              </form>
              <span className="text-[13px] text-brand-ink-2">
                Pro {formatMoney(p.list("plan:pro", p.plans.find((x) => x.key === "pro")?.priceEur ?? 0, r.currency as (typeof CURRENCIES)[number]), r.currency as (typeof CURRENCIES)[number])} · Enterprise {formatMoney(p.list("plan:enterprise", p.plans.find((x) => x.key === "enterprise")?.priceEur ?? 0, r.currency as (typeof CURRENCIES)[number]), r.currency as (typeof CURRENCIES)[number])}
              </span>
            </li>
          ))}
        </CardRows>
      </SectionCard>

      <form action={savePricingSettingsAction} className="flex flex-col gap-6">
        <SectionCard title="Terms and payment" meta={<span className="text-[13px] text-brand-ink-2">Against the default: 12 months, invoiced quarterly</span>}>
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="flex flex-wrap gap-4">
              {Object.entries(p.termAdjustments).map(([t, v]) => (
                <Num admin={admin} key={t} name={`term${t}`} label={`${t} months`} value={pct(v)} suffix="%" />
              ))}
              <Num admin={admin} name="upfrontAdjustment" label="Paid upfront" value={pct(p.upfrontAdjustment)} suffix="%" />
              <Num admin={admin} name="fxMarkup" label="FX markup" value={pct(p.fxMarkup)} suffix="%" />
            </div>
            <p className="m-0 text-[13px] text-brand-ink-2">
              Example, Enterprise + PM + creative 20 + 40 per month: 3 months {formatMoney(example(3) ?? 0, "EUR")} · 6 months {formatMoney(example(6) ?? 0, "EUR")} · 12 months {formatMoney(example(12) ?? 0, "EUR")} · 18 months {formatMoney(example(18) ?? 0, "EUR")} · 12 months upfront {formatMoney(example(12, true) ?? 0, "EUR")}
            </p>
          </div>
        </SectionCard>

        <SectionCard title="Credits" meta={<span className="text-[13px] text-brand-ink-2">1 team credit ≈ 1 hour · 1 AI credit ≈ one short piece of copy</span>}>
          <div className="flex flex-wrap gap-4 px-6 py-5">
            <Num admin={admin} name="aiTokensPerCredit" label="Weighted tokens per AI credit" value={s.aiTokensPerCredit as number} step="1" />
            <Num admin={admin} name="teamRolloverCap" label="PM and creative rollover cap" value={s.teamRolloverCap as number} suffix="× monthly" />
            <label className="flex flex-col gap-1 text-[12px] text-brand-ink-2">
              AI credits roll over
              <input type="hidden" name="aiRolloverSet" value="1" />
              <input name="aiRollover" type="checkbox" defaultChecked={Boolean(s.aiRollover)} disabled={!admin} className="size-5" />
            </label>
            <Num admin={admin} name="creativeCreditsPerSlot" label="Creative credits per active project" value={s.creativeCreditsPerSlot as number} step="1" />
            <Num admin={admin} name="pmLinePercent" label="PM line on estimates" value={pct(s.pmLinePercent as number)} suffix="% of creative" />
            <Num admin={admin} name="pmLineMin" label="PM line minimum" value={s.pmLineMin as number} suffix="credits" />
          </div>
        </SectionCard>

        <SectionCard title="Extras" meta={<span className="text-[13px] text-brand-ink-2">Bought by request; staff approve; on the next invoice</span>}>
          <div className="flex flex-wrap gap-4 px-6 py-5">
            <Num admin={admin} name="creativePackSize" label="Creative pack size" value={s.creativePackSize as number} suffix="credits" step="1" />
            <Num admin={admin} name="creativePackSurcharge" label="Pack price over the pack's per-credit rate" value={pct(s.creativePackSurcharge as number)} suffix="%" />
            <Num admin={admin} name="aiTopUpCredits" label="AI top-up" value={p.aiTopUp.credits} suffix="AI credits" step="1" />
            <Num admin={admin} name="aiTopUpEur" label="AI top-up price" value={p.aiTopUp.priceEur} suffix="€" />
            <span className="self-end pb-2 text-[13px] text-brand-ink-2">= {formatMoney(aiTopUpPrice(p, "SEK").price, "SEK")} in SEK</span>
          </div>
        </SectionCard>

        <SectionCard title="Fair use and VAT">
          <div className="flex flex-wrap gap-4 px-6 py-5">
            <Num admin={admin} name="assistantFairUsePerDay" label="Assistant calls per client per day" value={s.assistantFairUsePerDay as number} step="1" />
            <Num admin={admin} name="vatRateDomestic" label="VAT, clients in Sweden" value={pct(s.vatRateDomestic as number)} suffix="% (abroad: reverse charge)" />
          </div>
        </SectionCard>

        {admin && (
          <div>
            <Button type="submit" variant="primary">
              Save all
            </Button>
          </div>
        )}
      </form>
    </OpsPage>
  );
}

function Num({ admin, name, label, value, suffix, step = "any" }: { admin: boolean; name: string; label: string; value: number; suffix?: string; step?: string }) {
  return (
    <label className="flex flex-col gap-1 text-[12px] text-brand-ink-2">
      {label}
      <span className="flex items-center gap-1.5">
        <input name={name} type="number" step={step} defaultValue={value} readOnly={!admin} className={`${field} w-24`} />
        {suffix && <span>{suffix}</span>}
      </span>
    </label>
  );
}
