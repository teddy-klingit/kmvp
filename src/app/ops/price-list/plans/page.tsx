import { requireOpsPage } from "@/lib/authz";
import { roleTierFor } from "@/lib/role-tier";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { Card, SectionCard, CardRows } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { PRICE_LIST_TABS } from "@/components/ops/price-list-tabs";
import { CURRENCIES, formatMoney, loadPricing, monthlyPrice, type Currency, type Pricing } from "@/lib/pricing";
import { savePlatformPlanAction, savePriceOverrideAction, saveTeamPackAction } from "@/lib/actions/ops-pricing-actions";

const field = "h-9 rounded-[8px] border border-brand-outline bg-white px-3 text-[14px] outline-none focus:border-brand-ink";
const OTHER = CURRENCIES.filter((c) => c !== "EUR");

/**
 * Price List → Plans & packs (Phase S): the three platform plans and the team packs, in EUR, with the converted
 * price per currency (FX rule, or a staff override) and the monthly total for the default 12-month term.
 * Every price is a placeholder. Contracts lock the price at signing: editing here never changes a signed client.
 */
export default async function PlansAndPacksPage() {
  const viewer = await requireOpsPage(["ADMIN", "PM"]);
  const admin = roleTierFor(viewer.title) === "ADMIN";
  const p = await loadPricing();

  return (
    <OpsPage>
      <PageHeader eyebrow="EUR is the base · contracts lock prices at signing" title="Price List" tabsLabel="Price List sections" tabs={PRICE_LIST_TABS} />
      <Card tone="muted" className="flex flex-wrap items-center gap-3 px-6 py-4 text-[13px] leading-[1.5] text-brand-ink-2">
        <PlaceholderTag />
        <span className="min-w-0 flex-1">All prices are placeholders. Other currencies follow the FX rule (EUR × rate × {1 + p.fxMarkup}, rounded to 5) unless you set an amount. Clear an amount and Set to go back to the rule.</span>
      </Card>

      <SectionCard title="Platform plans" meta={<span className="text-[13px] text-brand-ink-2">EUR per month · 12 months, quarterly</span>}>
        <CardRows>
          {p.plans.map((plan) => (
            <li key={plan.key} className="flex flex-col gap-3 px-6 py-4">
              <form action={savePlatformPlanAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="key" value={plan.key} />
                <label className="flex flex-col gap-1 text-[12px] text-brand-ink-2">
                  Name
                  <input name="name" defaultValue={plan.name} readOnly={!admin} className={`${field} w-32`} />
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-brand-ink-2">
                  € / month
                  <input name="priceEur" type="number" min={0} step="1" defaultValue={plan.priceEur} readOnly={!admin} className={`${field} w-24`} />
                </label>
                <label className="flex flex-col gap-1 text-[12px] text-brand-ink-2">
                  AI credits / month
                  <input name="aiCreditsPerMonth" type="number" min={0} defaultValue={plan.aiCreditsPerMonth} readOnly={!admin || plan.ownModel} className={`${field} w-28`} />
                </label>
                <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[12px] text-brand-ink-2">
                  Line on the plan card
                  <input name="tagline" defaultValue={plan.tagline ?? ""} readOnly={!admin} className={field} />
                </label>
                {admin && (
                  <Button type="submit" variant="secondary" size="sm">
                    Save
                  </Button>
                )}
              </form>
              <Converted pricing={p} admin={admin} refKey={`plan:${plan.key}`} eur={plan.priceEur} />
              {plan.ownModel && <span className="text-[12px] text-brand-ink-2">The client’s own AI: their provider bills it; no AI credits.</span>}
            </li>
          ))}
        </CardRows>
      </SectionCard>

      <SectionCard title="Team packs" meta={<span className="text-[13px] text-brand-ink-2">Team part, € per month · needs Enterprise · 1 credit ≈ 1 hour</span>}>
        <CardRows>
          {p.packs.map((pack) => {
            const total = pack.perRequest ? null : monthlyPrice(p, { planKey: pack.requiresPlanKey, packKey: pack.key, term: 12, currency: "EUR" });
            return (
              <li key={pack.key} className="flex flex-col gap-3 px-6 py-4">
                {pack.perRequest ? (
                  <span className="text-[14px]">
                    <b className="font-semibold">{pack.name}</b> <span className="text-brand-ink-2">· credits and price set by staff on each contract</span>
                  </span>
                ) : (
                  <form action={saveTeamPackAction} className="flex flex-wrap items-end gap-3">
                    <input type="hidden" name="key" value={pack.key} />
                    <label className="flex flex-col gap-1 text-[12px] text-brand-ink-2">
                      Name
                      <input name="name" defaultValue={pack.name} readOnly={!admin} className={`${field} w-48`} />
                    </label>
                    <label className="flex flex-col gap-1 text-[12px] text-brand-ink-2">
                      PM credits
                      <input name="pmCredits" type="number" min={0} defaultValue={pack.pmCredits} readOnly={!admin} className={`${field} w-24`} />
                    </label>
                    <label className="flex flex-col gap-1 text-[12px] text-brand-ink-2">
                      Creative credits
                      <input name="creativeCredits" type="number" min={0} defaultValue={pack.creativeCredits} readOnly={!admin} className={`${field} w-24`} />
                    </label>
                    <label className="flex flex-col gap-1 text-[12px] text-brand-ink-2">
                      € / month
                      <input name="priceEur" type="number" min={0} defaultValue={pack.priceEur ?? ""} readOnly={!admin} className={`${field} w-28`} />
                    </label>
                    {admin && (
                      <Button type="submit" variant="secondary" size="sm">
                        Save
                      </Button>
                    )}
                    {total?.total != null && <span className="pb-2 text-[13px] text-brand-ink-2">With Enterprise: {formatMoney(total.total, "EUR")} / month</span>}
                  </form>
                )}
                {!pack.perRequest && pack.priceEur != null && <Converted pricing={p} admin={admin} refKey={`pack:${pack.key}`} eur={pack.priceEur} />}
              </li>
            );
          })}
        </CardRows>
      </SectionCard>
    </OpsPage>
  );
}

/** The converted list price per currency, each with a staff override. */
function Converted({ pricing, admin, refKey, eur }: { pricing: Pricing; admin: boolean; refKey: string; eur: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {OTHER.map((c: Currency) => (
        <form key={c} action={savePriceOverrideAction} className="flex items-center gap-1.5 text-[12px] text-brand-ink-2">
          <input type="hidden" name="ref" value={refKey} />
          <input type="hidden" name="currency" value={c} />
          <span className="w-8 font-brand-mono">{c}</span>
          <input name="amount" defaultValue={pricing.list(refKey, eur, c)} readOnly={!admin} aria-label={`${refKey} in ${c}`} className={`${field} h-8 w-24 text-right tabular-nums`} />
          {admin && (
            <button type="submit" className="text-[12px] underline underline-offset-2">
              Set
            </button>
          )}
        </form>
      ))}
    </div>
  );
}
