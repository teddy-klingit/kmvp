import { SETTINGS_CHIPS } from "@/components/ops/price-list-tabs";
import { AdminSection } from "@/components/ops/admin/admin-section";
import { prisma } from "@/lib/prisma";
import { requireOpsPage } from "@/lib/authz";
import { hasAdmin } from "@/lib/role-tier";
import { PageHeader } from "@/components/ds/page-header";
import { Card, SectionCard, CardRows, CardNote } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { formatDate } from "@/lib/utils";
import { IMAGE_CREDITS, OUTPUT_TOKEN_WEIGHT, TOKENS_PER_AI_CREDIT, WEB_SEARCH_TOKENS } from "@/lib/ai-credits";
import { decideTopUpAction, saveBundleAction, savePlanAction } from "@/lib/actions/plan-actions";

const field = "h-9 rounded-[8px] border border-brand-outline bg-white px-3 text-[14px] outline-none focus:border-brand-ink";

/**
 * Ops → Plans & AI credits (next to the Price list): each plan's AI credits, team credits, active slots and price;
 * the AI-credit bundles; clients' top-up requests to confirm; and the token → credit rate. Every number here is a
 * placeholder until pricing is decided, and says so.
 */
export default async function PlansPage() {
  const viewer = await requireOpsPage(["ADMIN", "PM"]);
  const admin = hasAdmin(viewer);
  const [plans, bundles, requests, counts] = await Promise.all([
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.aiCreditBundle.findMany({ orderBy: { size: "asc" } }),
    prisma.aiTopUpRequest.findMany({ where: { status: "PENDING" }, include: { bundle: true, client: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.client.groupBy({ by: ["planTier"], _count: true }),
  ]);
  const clientsOn = (tier: string) => counts.find((c) => c.planTier === tier)?._count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <AdminSection note={`Old plans & AI credits · ${plans.length} plans · ${requests.length} top-up${requests.length === 1 ? "" : "s"} waiting`} chips={SETTINGS_CHIPS} current="/ops/admin/settings/plans" />
      <Card tone="muted" className="flex flex-wrap items-center gap-3 px-6 py-4 text-[13px] leading-[1.5] text-brand-ink-2">
        <PlaceholderTag />
        <span className="min-w-0 flex-1">Plan prices, AI allowances, bundle sizes and prices and the token rate are placeholders until pricing is decided. Clients see them marked the same way.</span>
      </Card>

      <SectionCard title="Plans" meta={<span className="text-[13px] text-brand-ink-2">AI credits reset monthly · team credits: 1 credit = 1 hour</span>}>
        <CardRows>
          {plans.map((p) => (
            <li key={p.tier} className="flex flex-col gap-3 px-6 py-4">
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-[16px]">{p.name || p.tier}</span>
                <span className="text-[13px] text-brand-ink-2">
                  {clientsOn(p.tier)} client{clientsOn(p.tier) === 1 ? "" : "s"}
                  {p.ownModel ? " · own AI model: tokens logged, never deducted" : ""}
                </span>
              </span>
              <form action={savePlanAction} className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="tier" value={p.tier} />
                {[
                  { name: "monthlyAiCredits", label: "AI credits / month", value: p.monthlyAiCredits, disabled: p.ownModel },
                  { name: "monthlyTeamCredits", label: "Team credits / month", value: p.monthlyTeamCredits },
                  { name: "activeSlots", label: "Active slots", value: p.activeSlots },
                ].map((f) => (
                  <label key={f.name} className="flex flex-col gap-1 text-[12px] text-brand-ink-2">
                    {f.label}
                    <input name={f.name} type="number" min={f.name === "activeSlots" ? 1 : 0} defaultValue={f.value} readOnly={f.disabled || !admin} className={`${field} w-28`} />
                  </label>
                ))}
                <label className="flex flex-col gap-1 text-[12px] text-brand-ink-2">
                  Price / month (€)
                  <input name="priceAmount" type="number" min={0} step="1" defaultValue={p.priceAmount ?? ""} placeholder="—" readOnly={!admin} className={`${field} w-28`} />
                </label>
                {admin && (
                  <Button type="submit" size="sm" variant="secondary">
                    Save
                  </Button>
                )}
              </form>
            </li>
          ))}
        </CardRows>
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 min-[1000px]:grid-cols-2">
        <SectionCard title="AI-credit bundles" meta={<PlaceholderTag>Sizes and prices TBD</PlaceholderTag>}>
          <CardRows>
            {bundles.map((b) => (
              <li key={b.id} className="px-6 py-4">
                <form action={saveBundleAction} className="flex flex-wrap items-end gap-3">
                  <input type="hidden" name="id" value={b.id} />
                  <label className="flex flex-col gap-1 text-[12px] text-brand-ink-2">
                    AI credits
                    <input name="size" type="number" min={1} defaultValue={b.size} readOnly={!admin} className={`${field} w-28`} />
                  </label>
                  <label className="flex flex-col gap-1 text-[12px] text-brand-ink-2">
                    Price (€)
                    <input name="priceAmount" type="number" min={0} defaultValue={b.priceAmount ?? ""} placeholder="—" readOnly={!admin} className={`${field} w-28`} />
                  </label>
                  <label className="flex items-center gap-2 pb-2 text-[13px]">
                    <input type="checkbox" name="active" defaultChecked={b.active} disabled={!admin} className="accent-[#1E1E1E]" /> Offered
                  </label>
                  {admin && (
                    <Button type="submit" size="sm" variant="secondary">
                      Save
                    </Button>
                  )}
                </form>
              </li>
            ))}
          </CardRows>
          <CardNote>Bundles never expire and are used after the monthly allowance.</CardNote>
        </SectionCard>

        <SectionCard title="Top-up requests" meta={<span className="font-brand-mono text-[12px] text-brand-ink-2">{requests.length} WAITING</span>}>
          {requests.length === 0 ? (
            <CardNote>No top-ups waiting. When a client buys a bundle, it waits here for you to confirm: there is no payment yet.</CardNote>
          ) : (
            <CardRows>
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 px-6 py-4">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[15px]">
                      {r.client.name} · {r.bundle.size.toLocaleString("en-GB")} AI credits
                    </span>
                    <span className="text-[13px] text-brand-ink-2">Requested {formatDate(r.createdAt)}</span>
                  </span>
                  <form action={decideTopUpAction} className="flex gap-2">
                    <input type="hidden" name="requestId" value={r.id} />
                    <Button type="submit" name="decision" value="confirm" size="sm">
                      Confirm
                    </Button>
                    <Button type="submit" name="decision" value="reject" size="sm" variant="secondary">
                      Reject
                    </Button>
                  </form>
                </li>
              ))}
            </CardRows>
          )}
        </SectionCard>
      </div>

      <SectionCard title="How AI credits are counted" meta={<PlaceholderTag>Rate is a placeholder</PlaceholderTag>}>
        <ul className="m-0 flex list-disc flex-col gap-1.5 py-5 pl-11 pr-6 text-[14px] leading-[1.5] text-brand-ink-2">
          <li>
            1 AI credit = {TOKENS_PER_AI_CREDIT.toLocaleString("en-GB")} weighted tokens: input tokens + {OUTPUT_TOKEN_WEIGHT}× output tokens, times the model&apos;s price relative to the default model.
          </li>
          <li>
            A web search adds {WEB_SEARCH_TOKENS.toLocaleString("en-GB")} weighted tokens; a generated image adds {IMAGE_CREDITS} AI credits.
          </li>
          <li>Charged only for skills a client runs and assistants they use. Klingit&apos;s own production AI (estimates, staffing, quality check, scheduled jobs) never is.</li>
          <li>Set in one place: src/lib/ai-credits.ts.</li>
        </ul>
      </SectionCard>
    </div>
  );
}
