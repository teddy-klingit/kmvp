import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { formatDate } from "@/lib/utils";
import { PLAN_TIER_LABEL } from "@/lib/labels";
import { creditSummary, klingitChatHref } from "@/lib/client-home";
import { toggleTwoFactorAction } from "@/lib/actions/two-factor-actions";
import { PageGrid } from "@/components/ds/page-grid";
import { SectionCard } from "@/components/ds/card";
import { Meter } from "@/components/ds/stats";
import { StatusPill } from "@/components/ds/status-pill";
import { PillLink, monoLink } from "@/components/ds/pill-link";
import { pillClass } from "@/components/ds/button";
import { TeamRows } from "@/components/portal/team-rows";

/**
 * Account overview (Account.dc.html): the plan with this month's credits, the team with permission pills,
 * and billing and security as side cards. Only real data: no card details (we don't store any), no stored scores.
 */
export default async function AccountOverviewPage() {
  const viewer = await getPortalViewer();
  const now = new Date();
  const [client, credits, lastInvoice, chat] = await Promise.all([
    prisma.client.findUniqueOrThrow({ where: { id: viewer.clientId } }),
    creditSummary(viewer.clientId, now),
    prisma.invoice.findFirst({ where: { clientId: viewer.clientId, issuedAt: { not: null } }, orderBy: { issuedAt: "desc" } }),
    klingitChatHref(viewer.clientId),
  ]);
  const twoFactor = viewer.user.twoFactorEnabled;
  const approves = viewer.permission === "OWNER" || viewer.permission === "APPROVER";

  return (
    <PageGrid
      main={
        <>
          <SectionCard title="Plan">
            <div className="flex flex-col gap-4 px-6 py-6">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-[36px] font-light leading-none">{PLAN_TIER_LABEL[client.planTier] ?? client.planTier}</span>
                <span className="text-[16px] text-brand-ink-2">
                  {client.monthlyCreditAllowance} credits a month{client.renewalDate ? ` · renews ${formatDate(client.renewalDate, { day: "numeric", month: "short" })}` : ""}
                </span>
              </div>
              {credits.available !== null && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-3 text-[15px]">
                    <span>Credits this month</span>
                    <span className="tabular-nums">
                      {credits.used} of {credits.available} used
                    </span>
                  </div>
                  <Meter value={credits.used} max={credits.available} label={`${credits.used} of ${credits.available} credits used`} />
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <PillLink href={chat}>Ask about upgrading</PillLink>
                <PillLink href="/account/usage">See usage</PillLink>
              </div>
            </div>
          </SectionCard>
          <SectionCard
            title="Team"
            action={
              <Link href="/account/team#invite" className={monoLink}>
                + INVITE
              </Link>
            }
          >
            <TeamRows clientId={viewer.clientId} viewer={viewer} />
          </SectionCard>
        </>
      }
      side={
        <>
          <SectionCard title="Billing">
            <dl className="m-0 flex flex-col gap-3 px-6 py-5 text-[15px]">
              {client.cardLast4 && (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-brand-ink-2">Card</dt>
                  <dd className="m-0 flex items-center gap-2 text-right">
                    {client.cardBrand ?? "Card"} •••• {client.cardLast4}
                    {client.cardIsDemo && <StatusPill tone="watch">Demo</StatusPill>}
                  </dd>
                </div>
              )}
              {lastInvoice ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-brand-ink-2">Last invoice</dt>
                  <dd className="m-0 text-right">
                    {lastInvoice.number} · {lastInvoice.status.toLowerCase()}
                  </dd>
                </div>
              ) : (
                <dd className="m-0 text-brand-ink-2">No invoices yet.</dd>
              )}
              <Link href="/account/billing" className={`${monoLink} self-start`}>
                ALL INVOICES
              </Link>
            </dl>
          </SectionCard>
          <SectionCard title="Security">
            <div className="flex flex-col gap-3 px-6 py-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[15px]">Two-factor sign-in</span>
                <StatusPill tone={twoFactor ? "success" : "changes"}>{twoFactor ? "On" : "Off"}</StatusPill>
              </div>
              {!twoFactor && approves && <span className="text-[13px] text-brand-ink-2">Recommended for anyone who approves estimates.</span>}
              <form action={toggleTwoFactorAction}>
                <input type="hidden" name="enable" value={(!twoFactor).toString()} />
                <input type="hidden" name="path" value="/account" />
                <button type="submit" className={pillClass("secondary")}>
                  {twoFactor ? "Turn off" : "Turn on"}
                </button>
              </form>
            </div>
          </SectionCard>
        </>
      }
    />
  );
}
