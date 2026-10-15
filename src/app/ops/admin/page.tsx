import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PillLink } from "@/components/ds/pill-link";
import { clientsWithoutPm, suggestPm } from "@/lib/admin-jobs";
import { unassignedLiveAdAccounts } from "@/lib/integrations/live-ads-owner";
import { priceListGaps } from "@/lib/price-list-gaps";
import { loadToday } from "@/lib/today";
import { addDraftItemsAction, adAccountAction, assignPmAction, sendInvoiceReminderAction } from "@/lib/actions/admin-setup-actions";
import { PLAN_TIER_LABEL } from "@/lib/labels";
import { cn } from "@/lib/utils";

const pill = (primary: boolean) => cn("inline-flex h-9 items-center rounded-full px-4 font-brand-mono text-[12px] no-underline", primary ? "bg-brand-ink text-white" : "border border-[#CFC8B8] bg-white text-brand-ink hover:border-brand-ink");
const select = "h-9 rounded-full border border-[#CFC8B8] bg-white px-3 text-[13px] outline-none focus:border-brand-ink";
const KIND_WORD: Record<string, [string, string]> = { ESTIMATE: ["estimate", "estimates"], MESSAGE: ["message waiting", "messages waiting"], DEADLINE: ["late deadline", "late deadlines"], "QUALITY CHECK": ["quality check", "quality checks"], STAFFING: ["staffing choice", "staffing choices"], REQUEST: ["request", "requests"], PLAN: ["plan nudge", "plan nudges"], BRIEF: ["new brief", "new briefs"], AGENT: ["failed agent", "failed agents"], CHANGES: ["change request", "change requests"], INVOICE: ["invoice", "invoices"] };

function Job({ kind, title, detail, children }: { kind: string; title: string; detail: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex flex-col gap-3 border-t border-brand-line px-6 py-4 first:border-t-0 lg:flex-row lg:items-center lg:gap-6">
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="font-brand-mono text-[11px] uppercase tracking-[0.06em] text-brand-ink-2">{kind}</span>
        <span className="text-[16px]">{title}</span>
        <span className="text-[13px] leading-[1.5] text-brand-ink-2">{detail}</span>
      </span>
      <span className="flex flex-wrap items-center gap-2">{children}</span>
    </li>
  );
}

/**
 * Admin → To set up (Phase T, design PMAdmin): the jobs that keep the PMs' Today clean, each with its action here.
 * A client without a Marketing PM, ad accounts that feed nobody, overdue invoices, Price List gaps, old plans.
 */
export default async function AdminSetupPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string; quotes?: string }> }) {
  const q = await searchParams;
  const [noPm, ads, overdue, oldPlans, gaps, pms, clients, suggested] = await Promise.all([
    clientsWithoutPm(),
    unassignedLiveAdAccounts(),
    prisma.invoice.findMany({ where: { status: "OVERDUE", client: { isDemo: false } }, include: { client: { select: { name: true, accountLead: { select: { user: { select: { name: true } } } }, contracts: { where: { status: { in: ["active", "paused", "ending"] } }, select: { contact: { select: { user: { select: { name: true } } } } } } } } } }),
    prisma.client.findMany({ where: { isDemo: false, status: { not: "OFFBOARDED" }, contracts: { none: {} } }, select: { name: true, planTier: true } }),
    priceListGaps(),
    prisma.staffMember.findMany({ where: { title: { in: ["ACCOUNT_LEAD", "PROJECT_MANAGER"] }, user: { status: "ACTIVE" } }, include: { user: { select: { name: true } } }, orderBy: { user: { name: "asc" } } }),
    prisma.client.findMany({ where: { isDemo: false, status: { not: "OFFBOARDED" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    suggestPm(),
  ]);
  const suggestion = suggested ? ` Suggested: ${suggested.name}, who has the most free capacity (${suggested.clients} client${suggested.clients === 1 ? "" : "s"} now).` : "";
  // What's on nobody's Today because the client has no PM, by kind.
  const orphaned = await Promise.all(noPm.map(async (c) => ({ c, tasks: (await loadToday({ mine: false, clientIds: [c.id] }, new Date(), null, { ignorePm: true })).tasks })));
  const count = noPm.length + (ads.length ? 1 : 0) + overdue.length + (gaps.repeated.length ? 1 : 0) + (oldPlans.length ? 1 : 0);

  return (
    <div className="flex flex-col gap-6">
      {(q.ok || q.error) && <p className={cn("m-0 rounded-[10px] px-4 py-3 text-[14px]", q.error ? "bg-ds-watch-tint text-ds-watch-text" : "bg-white")}>{q.error ?? q.ok}</p>}
      <section aria-label="To set up" className="overflow-hidden rounded-[12px] bg-white">
        <h2 className="m-0 flex items-baseline gap-2 border-b border-brand-line px-6 py-4 text-[18px] font-normal">
          To set up <span className="text-[13px] text-brand-ink-2">Things that keep the PMs&apos; lists clean · {count}</span>
        </h2>
        {count === 0 ? (
          <p className="m-0 px-6 py-5 text-[14px] text-brand-ink-2">Nothing to set up.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {orphaned.map(({ c, tasks }) => {
              const by = new Map<string, number>();
              for (const t of tasks) by.set(t.kind, (by.get(t.kind) ?? 0) + 1);
              const parts = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${KIND_WORD[k]?.[n === 1 ? 0 : 1] ?? k.toLowerCase()}`);
              return (
                <Job key={c.id} kind="Contact person" title={`${c.name} has no Marketing PM`} detail={tasks.length ? `${tasks.length} open task${tasks.length === 1 ? "" : "s"} for this client ${tasks.length === 1 ? "is" : "are"} on nobody's Today: ${parts.join(", ")}.${suggestion}` : `Nothing open right now, but new work won't reach anyone's Today.${suggestion}`}>
                  <form action={assignPmAction} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="clientId" value={c.id} />
                    <select name="staffId" required defaultValue="" aria-label={`Marketing PM for ${c.name}`} className={select}>
                      <option value="" disabled>
                        Pick a PM
                      </option>
                      {pms.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.user.name}
                          {p.id === suggested?.id ? " (suggested)" : ""}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className={pill(true)}>
                      Assign
                    </button>
                  </form>
                </Job>
              );
            })}
            {ads.length > 0 && (
              <Job kind="Ad accounts" title={`${ads.length} ad account${ads.length === 1 ? "" : "s"} feed${ads.length === 1 ? "s" : ""} nobody`} detail={`${ads.map((a) => `${a.platform}${a.accountId ? ` ${a.accountId}` : ""}`).join(" · ")}. Assign ${ads.length === 1 ? "it" : "each"} to a client, or mark ${ads.length === 1 ? "it" : "them"} as Klingit's own ("internal"): then ${ads.length === 1 ? "it leaves" : "they leave"} every list.`}>
                <span className="flex flex-col gap-2">
                  {ads.map((a) => (
                    <form key={a.provider} action={adAccountAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="provider" value={a.provider} />
                      <span className="w-20 text-[13px]">{a.platform}</span>
                      <button type="submit" name="do" value="internal" className={pill(false)}>
                        Mark internal
                      </button>
                      <select name="clientId" defaultValue="" aria-label={`Client for ${a.platform}`} className={select}>
                        <option value="">Pick a client</option>
                        {clients.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button type="submit" name="do" value="assign" className={pill(true)}>
                        Assign
                      </button>
                    </form>
                  ))}
                </span>
              </Job>
            )}
            {overdue.map((inv) => {
              return (
                <Job key={inv.id} kind="Billing" title={`${inv.client.name} has an overdue invoice`} detail={`${inv.number} · ${inv.amount.toLocaleString("en-GB")} ${inv.currency}, past its due date. The reminder goes to the client's admins.`}>
                  <form action={sendInvoiceReminderAction}>
                    <input type="hidden" name="invoiceId" value={inv.id} />
                    <button type="submit" className={pill(false)}>
                      Send reminder
                    </button>
                  </form>
                  <PillLink href={`/ops/admin/billing/invoices/${inv.id}`} variant="primary">
                    Open invoice
                  </PillLink>
                </Job>
              );
            })}
            {gaps.repeated.length > 0 && (
              <Job
                kind="Price List"
                title={`${gaps.total} quote${gaps.total === 1 ? " was" : "s were"} for things not on the Price List this month`}
                detail={
                  <>
                    Asked more than once: {gaps.repeated.map((g) => `${g.name.toLowerCase()} (${g.count})`).join(", ")}. Adding them saves the PM a quote every time.
                    {q.quotes === "all" && (
                      <span className="mt-2 flex flex-col gap-1">
                        {gaps.gaps.map((g) => (
                          <span key={g.name}>
                            {g.name} · {g.count}: {g.examples.map((e) => `“${e}”`).join(", ")}
                          </span>
                        ))}
                      </span>
                    )}
                  </>
                }
              >
                <Link href={q.quotes === "all" ? "/ops/admin" : "/ops/admin?quotes=all"} className={pill(false)}>
                  {q.quotes === "all" ? "Hide" : `See all ${gaps.total}`}
                </Link>
                <form action={addDraftItemsAction}>
                  {gaps.repeated.map((g) => (
                    <input key={g.name} type="hidden" name="name" value={g.name} />
                  ))}
                  <button type="submit" className={pill(true)}>
                    Add {gaps.repeated.length} item{gaps.repeated.length === 1 ? "" : "s"}
                  </button>
                </form>
              </Job>
            )}
            {oldPlans.length > 0 && (
              <Job kind="Migration" title={`${oldPlans.length} client${oldPlans.length === 1 ? " is" : "s are"} still on old plans`} detail={`${oldPlans.map((c) => `${c.name} (${PLAN_TIER_LABEL[c.planTier] ?? c.planTier})`).join(", ")}. The preview is ready for your decision.`}>
                <PillLink href="/ops/admin/migration" variant="primary">
                  Open migration
                </PillLink>
              </Job>
            )}
          </ul>
        )}
      </section>
      <p className="m-0 text-[13px] text-brand-ink-2">
        Only admins see this area. PMs see an item here only when it&apos;s about one of their clients, and then it shows on their Today too. Client requests are on Today; <Link href="/ops/requests">all requests</Link> · flagged agent runs: <Link href="/ops/inbox">Inbox</Link>.
      </p>
    </div>
  );
}
