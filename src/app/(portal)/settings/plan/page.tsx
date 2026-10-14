import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { SectionCard, CardRows } from "@/components/ds/card";
import { Avatar } from "@/components/ds/avatar";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { SettingsHeader } from "@/components/portal/settings-header";
import { PlanBuilder, type PriceMatrix } from "@/components/portal/plan/plan-builder";
import { RequestForm } from "@/components/portal/plan/request-form";
import { liveContract } from "@/lib/contracts";
import { aiCreditStatus } from "@/lib/ai-credits";
import { poolNotes, poolOf, slotsForContract, teamBalances } from "@/lib/team-ledger";
import { marketingPm } from "@/lib/contact-person";
import { isCurrency, loadPricing, monthlyPrice, TERMS, type Currency } from "@/lib/pricing";
import { money } from "@/lib/invoicing";
import { quoteRequest, REQUEST_KINDS, type RequestKind } from "@/lib/requests";
import { getSetting } from "@/lib/platform-settings";
import { jsonArray } from "@/lib/utils";

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);
const WAY = { 1: "Platform only", 2: "Platform + Marketing PM", 3: "Platform + Marketing PM + creative team" } as const;

/**
 * Settings → Plan (Phase S): the way you work with Klingit, your platform plan and pack, the three balances (AI, PM,
 * creative), the term, end date, notice deadline, invoicing and currency, your Marketing PM, and every change as a
 * request with its price and rule: change plan or pack (the pricing page's layout A), extra creative credits, AI
 * top-up, an extra project, pause, Per request. Admins act; members read.
 */
export default async function PlanSettingsPage() {
  const viewer = await getPortalViewer();
  const admin = isClientAdmin(viewer);
  const [contract, pricing, ai, balances, pm, requests] = await Promise.all([
    liveContract(viewer.clientId),
    loadPricing(),
    aiCreditStatus(viewer.clientId),
    teamBalances(viewer.clientId),
    marketingPm(viewer.clientId),
    prisma.purchaseRequest.findMany({ where: { clientId: viewer.clientId }, orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const currency: Currency = contract && isCurrency(contract.currency) ? contract.currency : "EUR";
  const way = !contract?.teamPackKey ? 1 : (contract.creativeCreditsPerMonth ?? 0) > 0 ? 3 : 2;
  const per = await getSetting("creativeCreditsPerSlot");
  const packs = pricing.packs.filter((p) => !p.perRequest);
  const prices: PriceMatrix = {};
  for (const plan of pricing.plans)
    for (const pack of [null, ...packs])
      for (const term of TERMS) {
        if (pack && plan.key !== pack.requiresPlanKey) continue;
        prices[`${plan.key}|${pack?.key ?? "none"}|${term}`] = monthlyPrice(pricing, { planKey: plan.key, packKey: pack?.key ?? null, term, currency });
      }
  const [packQuotes, topUps, slot] = await Promise.all([
    Promise.all([1, 2, 3].map((packs) => quoteRequest(viewer.clientId, "creative_pack", { packs }).then((q) => ({ label: `${q.credits} creative credits`, payload: { packs }, price: money(q.price ?? 0, q.currency) })))),
    Promise.all([1, 2, 4].map((count) => quoteRequest(viewer.clientId, "ai_topup", { count }).then((q) => ({ label: `${q.credits.toLocaleString("en-GB")} AI credits`, payload: { count }, price: money(q.price ?? 0, q.currency) })))),
    contract?.teamPrice ? quoteRequest(viewer.clientId, "extra_slot", {}).then((q) => ({ label: "One more project at once", payload: {}, price: `${money(q.price ?? 0, q.currency)} a month` })) : null,
  ]);
  const slots = contract ? await slotsForContract(contract) : null;
  const balance = (label: string, left: number, of: number, sub: string, purple = false) => (
    <div className="flex flex-col gap-2 rounded-[12px] bg-white px-5 py-4">
      <span className="text-[13px] text-brand-ink-2">{label}</span>
      <span className="text-[28px] font-light tabular-nums">
        {Math.round(left).toLocaleString("en-GB")} <span className="text-[14px] text-brand-ink-2">of {Math.round(of).toLocaleString("en-GB")} left</span>
      </span>
      <span className="h-1.5 overflow-hidden rounded-full bg-brand-track">
        <span className={`block h-full rounded-full ${purple ? "bg-[#B455B6]" : "bg-brand-ink"}`} style={{ width: `${of > 0 ? Math.max(0, Math.min(100, ((of - left) / of) * 100)) : 0}%` }} />
      </span>
      <span className="text-[12px] text-brand-ink-2">{sub}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader eyebrow={`Way ${way} · ${WAY[way]}${admin ? "" : " · read-only"}`} title="Plan" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {balance("AI credits", ai.ownModel ? 0 : ai.left, ai.allowance, ai.ownModel ? "Your own AI model: your provider bills it" : "For skills you run · reset monthly, don't roll over", true)}
        {balances && balances.pm.monthly > 0 && balance("PM credits", balances.pm.left, poolOf(balances.pm), [`${balances.pm.monthly} a month · roll over up to 150%`, ...poolNotes(balances.pm)].join(" · "))}
        {balances && (balances.creative.monthly > 0 || balances.creative.left > 0) && balance("Creative credits", balances.creative.left, poolOf(balances.creative), [`${balances.creative.monthly} a month`, ...poolNotes({ ...balances.creative, services: 0 }), ...balances.services.map((s) => `${s.name} ${s.creditsPerMonth} reserved`)].join(" · "))}
      </div>

      <div className="grid grid-cols-1 gap-6 min-[1000px]:grid-cols-[minmax(0,1fr)_320px]">
        <SectionCard title="Your contract" meta={<PlaceholderTag>Prices</PlaceholderTag>}>
          {contract ? (
            <dl className="m-0 grid grid-cols-1 gap-x-6 gap-y-3 px-6 py-5 text-[14px] sm:grid-cols-2">
              {[
                ["Platform plan", `${pricing.plans.find((p) => p.key === contract.platformPlanKey)?.name ?? contract.platformPlanKey} · ${money(contract.platformPrice, currency)} a month`],
                ["Team", contract.teamPackKey ? `${pricing.packs.find((p) => p.key === contract.teamPackKey)?.name ?? contract.teamPackKey} · ${money(contract.teamPrice, currency)} a month` : "Platform only"],
                ["Projects at once", slots != null ? String(slots) : "—"],
                ["Term", `${contract.termMonths} months · ${day(contract.startDate)} – ${day(contract.endDate)}`],
                ["Notice deadline", `${day(contract.noticeDeadline)} · renews for ${contract.termMonths} months unless cancelled by then`],
                ["Invoicing", `${contract.invoicing.charAt(0).toUpperCase() + contract.invoicing.slice(1)} · ${currency} · by invoice`],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5">
                  <dt className="text-[12px] text-brand-ink-2">{k}</dt>
                  <dd className="m-0">{v}</dd>
                </div>
              ))}
              {contract.status !== "active" && <p className="m-0 text-[13px] text-brand-orange-text sm:col-span-2">This contract is {contract.status}.</p>}
            </dl>
          ) : (
            <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">You&apos;re on the {ai.plan.name} plan. Klingit is moving clients to the new plans (Basic, Pro, Enterprise and team packs): your contact person will be in touch before anything changes.</p>
          )}
        </SectionCard>
        <SectionCard title="Your Marketing PM">
          {pm ? (
            <div className="flex flex-col gap-3 px-6 py-5">
              <span className="flex items-center gap-3">
                <Avatar name={pm.name} size={44} />
                <span className="flex flex-col">
                  <span className="text-[16px]">{pm.name}</span>
                  <span className="text-[13px] text-brand-ink-2">Plans, briefs and the work with you</span>
                </span>
              </span>
              <Link href={pm.messageHref} className="self-start text-[14px] text-brand-ink underline underline-offset-4">
                Message {pm.name.split(" ")[0]}
              </Link>
            </div>
          ) : (
            <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">A Marketing PM comes with any team pack.</p>
          )}
        </SectionCard>
      </div>

      {contract && (
        <SectionCard title="Change plan or pack">
          <PlanBuilder
            plans={pricing.plans.map((p) => ({ key: p.key, name: p.name, tagline: p.tagline, aiCredits: p.aiCreditsPerMonth, ownModel: p.ownModel, features: jsonArray<string>(p.features) }))}
            packs={packs.map((p) => ({ key: p.key, name: p.name, pm: p.pmCredits, creative: p.creativeCredits, slots: Math.max(1, Math.floor(p.creativeCredits / per)) }))}
            prices={prices}
            current={{ planKey: contract.platformPlanKey, packKey: contract.teamPackKey, term: contract.termMonths }}
            currency={currency}
            admin={admin}
            today={contract.platformPrice + contract.teamPrice}
          />
        </SectionCard>
      )}

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 min-[1100px]:grid-cols-3">
        <SectionCard title="Extra creative credits">
          <RequestForm kind="creative_pack" title="Buy creative credits" rule={REQUEST_KINDS.creative_pack.rule} options={packQuotes} admin={admin} cta="Ask for credits" />
        </SectionCard>
        <SectionCard title="AI credits">
          <RequestForm kind="ai_topup" title="Top up AI credits" rule={REQUEST_KINDS.ai_topup.rule} options={topUps} admin={admin} cta="Ask for a top-up" />
        </SectionCard>
        {slot && (
          <SectionCard title="Projects at once">
            <RequestForm kind="extra_slot" title="Add a slot" rule={REQUEST_KINDS.extra_slot.rule} options={[slot]} admin={admin} cta="Ask for a slot" />
          </SectionCard>
        )}
        {contract && (
          <SectionCard title="Pause">
            <RequestForm kind="pause" title="Ask to pause" rule={REQUEST_KINDS.pause.rule} note="Why and for how long" admin={admin} cta="Ask to pause" />
          </SectionCard>
        )}
        <SectionCard title="Something else">
          <RequestForm kind="per_request" title="Per request" rule={REQUEST_KINDS.per_request.rule} note="What do you need?" admin={admin} cta="Send to Klingit" />
        </SectionCard>
      </div>

      {requests.length > 0 && (
        <SectionCard title="Your requests">
          <CardRows>
            {requests.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-4 px-6 py-3 text-[14px]">
                <span className="flex-1">{REQUEST_KINDS[r.kind as RequestKind]?.label ?? r.kind}</span>
                <span className="text-brand-ink-2">{r.price != null ? money(r.price, r.currency as Currency) : ""}</span>
                <span className={r.status === "pending" ? "text-brand-orange-text" : "text-brand-ink-2"}>{r.status === "pending" ? "Waiting for Klingit" : r.status}</span>
                <span className="text-[12px] text-brand-ink-2">{day(r.createdAt)}</span>
              </li>
            ))}
          </CardRows>
        </SectionCard>
      )}
    </div>
  );
}
