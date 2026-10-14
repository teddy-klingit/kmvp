import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardBody, CardRows } from "@/components/ds/card";
import { Button } from "@/components/ds/button";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { Field, fieldClass } from "@/components/ops/form-field";
import { dayKey, liveContract } from "@/lib/contracts";
import { CURRENCIES, formatMoney, isCurrency, loadPricing, TERMS } from "@/lib/pricing";
import { cancelAction, createContractAction, downgradeAction, endAction, pauseAction, resumeAction, setContactAction, upgradeAction } from "@/lib/actions/ops-contract-actions";

const day = (d: Date) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(d);
const KIND: Record<string, string> = { created: "Signed", upgrade: "Upgrade", "upgrade ended": "Upgrade ended", downgrade: "Downgrade", pause: "Paused", resume: "Restarted", renewed: "Renewed", cancelled: "Cancelled", ended: "Ended", contact: "Contact person" };

/**
 * Client workspace → Contract (Phase S step 4): the live contract with its locked prices, term, notice deadline and
 * contact person; amend it (upgrade, downgrade, pause, cancel, end) and see every change. Creating one locks today's
 * list prices for the chosen term and currency.
 */
export default async function ContractPage({ params, searchParams }: { params: Promise<{ clientId: string }>; searchParams: Promise<{ ok?: string; error?: string }> }) {
  const [{ clientId }, q] = await Promise.all([params, searchParams]);
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, name: true } });
  if (!client) notFound();
  const [contract, pricing, staff, history] = await Promise.all([
    liveContract(clientId),
    loadPricing(),
    prisma.staffMember.findMany({ where: { title: { in: ["ACCOUNT_LEAD", "PROJECT_MANAGER", "ADMIN"] } }, include: { user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } }),
    prisma.contract.findMany({ where: { clientId, status: "ended" }, orderBy: { startDate: "desc" } }),
  ]);
  const cur = contract && isCurrency(contract.currency) ? contract.currency : "EUR";
  const plan = (k: string) => pricing.plans.find((p) => p.key === k)?.name ?? k;
  const pack = (k: string | null) => (k ? (pricing.packs.find((p) => p.key === k)?.name ?? k) : "No team pack");
  const hidden = (
    <>
      <input type="hidden" name="clientId" value={clientId} />
      {contract && <input type="hidden" name="contractId" value={contract.id} />}
    </>
  );
  const packSelect = (none = true) => (
    <select name="teamPackKey" className={fieldClass} defaultValue="">
      {none && <option value="">No team pack</option>}
      {pricing.packs.map((p) => (
        <option key={p.key} value={p.key}>
          {p.name}
          {p.priceEur != null ? ` · €${p.priceEur}` : ""}
        </option>
      ))}
    </select>
  );

  return (
    <>
      {(q.ok || q.error) && <p className={`m-0 rounded-[10px] px-4 py-3 text-[14px] ${q.error ? "bg-ds-watch-tint text-ds-watch-text" : "bg-white"}`}>{q.error ?? q.ok}</p>}

      {contract ? (
        <SectionCard title="Contract" meta={<span className="font-brand-mono text-[12px] uppercase text-brand-ink-2">{contract.status}</span>}>
          <CardBody>
            <dl className="m-0 grid grid-cols-1 gap-x-8 gap-y-3 text-[14px] sm:grid-cols-3">
              {[
                ["Platform", `${plan(contract.platformPlanKey)} · ${formatMoney(contract.platformPrice, cur)} / month`],
                ["Team", contract.teamPackKey ? `${pack(contract.teamPackKey)} · ${formatMoney(contract.teamPrice, cur)} / month` : "Platform only"],
                ["Credits a month", `PM ${contract.pmCreditsPerMonth} · creative ${contract.creativeCreditsPerMonth}`],
                ["Term", `${contract.termMonths} months · ${day(contract.startDate)} – ${day(contract.endDate)}`],
                ["Notice deadline", `${day(contract.noticeDeadline)}${contract.autoRenew ? " · renews automatically" : " · won't renew"}`],
                ["Invoicing", `${contract.invoicing} · ${contract.currency}`],
                ["Contact person", contract.contact?.user.name ?? "None"],
                ["Paused", contract.pausedFrom ? `since ${day(contract.pausedFrom)}` : contract.pausedDays ? `${contract.pausedDays} days in total` : "No"],
              ].map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5">
                  <dt className="text-[12px] text-brand-ink-2">{k}</dt>
                  <dd className="m-0">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="m-0 mt-3 text-[12px] text-brand-ink-2">Prices are locked at signing. List prices are placeholders.</p>
          </CardBody>
        </SectionCard>
      ) : (
        <SectionCard title="New contract" meta={<PlaceholderTag>Prices</PlaceholderTag>}>
          <CardBody>
            <form action={createContractAction} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {hidden}
              <Field label="Platform plan" htmlFor="platformPlanKey">
                <select id="platformPlanKey" name="platformPlanKey" className={fieldClass} defaultValue="enterprise">
                  {pricing.plans.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.name} · €{p.priceEur}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Team pack (needs Enterprise)" htmlFor="teamPackKey">
                {packSelect()}
              </Field>
              <Field label="Contact person (needed with a pack)" htmlFor="contactStaffId">
                <select id="contactStaffId" name="contactStaffId" className={fieldClass} defaultValue="">
                  <option value="">None</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.user.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Per request: PM / creative credits, € team price" htmlFor="customPm">
                <span className="flex gap-2">
                  <input id="customPm" name="customPm" placeholder="PM" className={fieldClass} />
                  <input name="customCreative" placeholder="Creative" className={fieldClass} />
                  <input name="customTeamEur" placeholder="€" className={fieldClass} />
                </span>
              </Field>
              <Field label="Term" htmlFor="termMonths">
                <select id="termMonths" name="termMonths" className={fieldClass} defaultValue="12">
                  {TERMS.map((t) => (
                    <option key={t} value={t}>
                      {t} months
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Invoicing" htmlFor="invoicing">
                <select id="invoicing" name="invoicing" className={fieldClass} defaultValue="">
                  <option value="">Default (monthly for 3 months, else quarterly)</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="upfront">Upfront</option>
                </select>
              </Field>
              <Field label="Currency" htmlFor="currency">
                <select id="currency" name="currency" className={fieldClass} defaultValue="EUR">
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Start date" htmlFor="startDate">
                <input id="startDate" name="startDate" type="date" required className={fieldClass} />
              </Field>
              <div className="flex items-end">
                <Button type="submit" variant="primary">
                  Create contract
                </Button>
              </div>
            </form>
          </CardBody>
        </SectionCard>
      )}

      {contract && (
        <SectionCard title="Change it">
          <CardRows>
            <li className="px-6 py-4">
              <form action={setContactAction} className="flex flex-wrap items-end gap-3">
                {hidden}
                <Field label="Contact person (the client is told)" htmlFor="contact">
                  <select id="contact" name="contactStaffId" className={fieldClass} defaultValue={contract.contactStaffId ?? ""}>
                    <option value="">None</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.user.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button type="submit" variant="secondary" size="sm">
                  Change
                </Button>
              </form>
            </li>
            <li className="px-6 py-4">
              <form action={upgradeAction} className="flex flex-wrap items-end gap-3">
                {hidden}
                <Field label="Upgrade to (7 days' notice)" htmlFor="up">
                  {packSelect(false)}
                </Field>
                <Field label="For" htmlFor="months">
                  <select id="months" name="months" className={fieldClass} defaultValue="3">
                    {TERMS.filter((t) => t >= 3).map((t) => (
                      <option key={t} value={t}>
                        {t} months
                      </option>
                    ))}
                  </select>
                </Field>
                <Button type="submit" variant="secondary" size="sm">
                  Schedule upgrade
                </Button>
                <span className="text-[12px] text-brand-ink-2">Priced at the upgrade length&apos;s rate, then back to the contract.</span>
              </form>
            </li>
            <li className="px-6 py-4">
              <form action={downgradeAction} className="flex flex-wrap items-end gap-3">
                {hidden}
                <Field label="Downgrade to (a month's notice, once a month)" htmlFor="down">
                  {packSelect()}
                </Field>
                <Button type="submit" variant="secondary" size="sm">
                  Schedule downgrade
                </Button>
              </form>
            </li>
            <li className="flex flex-wrap items-center gap-3 px-6 py-4">
              {contract.status === "paused" ? (
                <form action={resumeAction}>
                  {hidden}
                  <Button type="submit" variant="secondary" size="sm">
                    Restart
                  </Button>
                </form>
              ) : (
                <form action={pauseAction} className="flex items-center gap-2">
                  {hidden}
                  <input name="note" placeholder="Why (for the log)" className={`${fieldClass} w-56`} />
                  <Button type="submit" variant="secondary" size="sm">
                    Pause
                  </Button>
                </form>
              )}
              {contract.status !== "ending" && (
                <form action={cancelAction}>
                  {hidden}
                  <Button type="submit" variant="secondary" size="sm">
                    Cancel at end of term
                  </Button>
                </form>
              )}
              <form action={endAction} className="flex items-center gap-2">
                {hidden}
                <input name="note" placeholder="Why (for the log)" className={`${fieldClass} w-56`} />
                <Button type="submit" variant="secondary" size="sm">
                  End now
                </Button>
              </form>
            </li>
          </CardRows>
        </SectionCard>
      )}

      {contract && (
        <p className="m-0 text-[13px] text-brand-ink-2">
          Balances, adjustments and fixed services: <a href={`/ops/clients/${clientId}/balances`}>Balances</a>.
        </p>
      )}

      {contract && contract.changes.length > 0 && (
        <SectionCard title="History">
          <CardRows>
            {contract.changes.map((ch) => (
              <li key={ch.id} className="flex flex-wrap items-baseline gap-x-3 px-6 py-3 text-[14px]">
                <span className="w-32 text-[12px] text-brand-ink-2">{dayKey(ch.createdAt)}</span>
                <span>{KIND[ch.kind] ?? ch.kind}</span>
                <span className="text-[13px] text-brand-ink-2">
                  {ch.status === "scheduled" ? `scheduled from ${dayKey(ch.effectiveFrom)}` : `from ${dayKey(ch.effectiveFrom)}`}
                  {ch.until ? ` until ${dayKey(ch.until)}` : ""}
                  {ch.note ? ` · ${ch.note}` : ""}
                </span>
              </li>
            ))}
          </CardRows>
        </SectionCard>
      )}
      {history.length > 0 && (
        <p className="m-0 text-[13px] text-brand-ink-2">
          Earlier contracts: {history.map((h) => `${plan(h.platformPlanKey)} + ${pack(h.teamPackKey)}, ${day(h.startDate)} – ${day(h.endDate)}`).join(" · ")}
        </p>
      )}
    </>
  );
}
