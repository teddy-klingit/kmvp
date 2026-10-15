import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { SectionCard, CardRows, CardNote } from "@/components/ds/card";
import { StatRows, type Stat } from "@/components/ds/stats";
import { StatusPill, type PillTone } from "@/components/ds/status-pill";
import { Avatar } from "@/components/ds/avatar";
import { Button } from "@/components/ds/button";
import { formatDate } from "@/lib/utils";
import { PLAN_TIER_LABEL, CLIENT_PERMISSION_LABEL } from "@/lib/labels";
import {
  updateClientPlanAction,
  pauseClientAction,
  reactivateClientAction,
  offboardClientAction,
  setLiveAdsOwnerAction,
  setTeamCreditsOverrideAction,
} from "@/lib/actions/ops-client-admin-actions";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";
import { listLiveAdAccounts } from "@/lib/integrations/live-ads-owner";
import { adjustAiCreditsAction } from "@/lib/actions/plan-actions";
import { aiCreditStatus, teamAllowance } from "@/lib/ai-credits";

const INVOICE: Record<string, { label: string; tone: PillTone }> = {
  PAID: { label: "Paid", tone: "success" },
  SENT: { label: "Sent", tone: "info" },
  OVERDUE: { label: "Overdue", tone: "danger" },
  DRAFT: { label: "Draft", tone: "neutral" },
};

const count = (n: number) => <span className="font-brand-mono text-[12px] text-brand-ink-2">{n}</span>;

export default async function ClientAdminPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      accountLead: { include: { user: true } },
      users: { include: { user: true } },
      invoices: { orderBy: { issuedAt: "desc" }, take: 5 },
    },
  });
  if (!client) notFound();
  const [ai, team] = await Promise.all([aiCreditStatus(clientId), teamAllowance(clientId)]);
  const ledger = await prisma.aiCreditLedger.findMany({ where: { clientId }, orderBy: { createdAt: "desc" }, take: 8 });
  const [adAccounts, adLog] = await Promise.all([listLiveAdAccounts().then((xs) => xs.filter((a) => !a.internal)), prisma.auditLog.findMany({ where: { area: "ad-accounts", clientId }, orderBy: { createdAt: "desc" }, take: 5 })]);
  const actors = new Map((await prisma.user.findMany({ where: { id: { in: adLog.flatMap((l) => (l.actorUserId ? [l.actorUserId] : [])) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  const credits: Stat[] = [
    { label: team.source === "override" ? `Team credits / month · custom (${team.planName} plan: ${team.planValue})` : `Team credits / month · ${team.planName} plan`, value: `${team.value}c` },
    { label: "Current balance", value: `${client.creditBalance}c` },
    ...(client.renewalDate ? [{ label: "Renewal date", value: formatDate(client.renewalDate) }] : []),
  ];

  return (
    <>
      <div className="grid grid-cols-1 gap-6 min-[1000px]:grid-cols-2">
        <SectionCard title="Plan & billing">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-brand-line px-6 py-4">
            <span className="min-w-0 flex-1 text-[14px] text-brand-ink-2">Plan tier</span>
            <form action={updateClientPlanAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="clientId" value={clientId} />
              {(["BASIC", "STARTER", "GROWTH", "SCALE", "ENTERPRISE"] as const).map((tier) => (
                <Button key={tier} type="submit" name="planTier" value={tier} size="sm" variant={client.planTier === tier ? "primary" : "secondary"} aria-pressed={client.planTier === tier}>
                  {PLAN_TIER_LABEL[tier]}
                </Button>
              ))}
            </form>
          </div>
          <StatRows rows={credits} />
          {/* Team credits come from the plan (Plan table); a negotiated deal is an explicit, logged override. */}
          <form action={setTeamCreditsOverrideAction} className="flex flex-wrap items-end gap-3 border-t border-brand-line px-6 py-4">
            <input type="hidden" name="clientId" value={clientId} />
            <label className="flex flex-col gap-1 text-[13px] text-brand-ink-2">
              Team credits override
              <input name="override" type="number" min={0} defaultValue={team.source === "override" ? team.value : ""} placeholder={`${team.planValue} (plan)`} className="h-9 w-32 rounded-[8px] border border-brand-outline bg-white px-3 text-[14px] text-brand-ink" />
            </label>
            <Button type="submit" size="sm" variant="secondary">
              {team.source === "override" ? "Save" : "Set override"}
            </Button>
            <span className="flex items-center gap-2 text-[12px] text-brand-ink-2">
              Empty = the plan&apos;s value. Plan numbers are <PlaceholderTag />
            </span>
          </form>
        </SectionCard>

        <SectionCard title="AI credits" meta={<span className="font-brand-mono text-[12px] text-brand-ink-2">{ai.plan.name.toUpperCase()} · {ai.periodKey}</span>}>
          <StatRows
            rows={
              ai.ownModel
                ? [{ label: "Own AI model", value: `${ai.providerTokens.toLocaleString("en-GB")} tokens this month, billed by their provider` }]
                : [
                    { label: "Left this month", value: `${Math.floor(ai.left).toLocaleString("en-GB")} of ${ai.allowance.toLocaleString("en-GB")}` },
                    { label: "Used this month", value: Math.round(ai.used).toLocaleString("en-GB") },
                    { label: "Bundles left", value: Math.floor(ai.bundleLeft).toLocaleString("en-GB") },
                  ]
            }
          />
          <form action={adjustAiCreditsAction} className="flex flex-wrap items-end gap-2 border-t border-brand-line px-6 py-4">
            <input type="hidden" name="clientId" value={clientId} />
            <label className="flex flex-col gap-1 text-[12px] text-brand-ink-2">
              Adjust by
              <input name="amount" type="number" required placeholder="+100" className="h-9 w-24 rounded-[8px] border border-brand-outline bg-white px-3 text-[14px] outline-none focus:border-brand-ink" />
            </label>
            <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-[12px] text-brand-ink-2">
              Reason (logged)
              <input name="reason" required minLength={3} placeholder="Goodwill for the failed run on 3 Oct" className="h-9 rounded-[8px] border border-brand-outline bg-white px-3 text-[14px] outline-none focus:border-brand-ink" />
            </label>
            <Button type="submit" size="sm" variant="secondary">
              Adjust
            </Button>
          </form>
          {ledger.length > 0 && (
            <CardRows className="border-t border-brand-line">
              {ledger.map((l) => (
                <li key={l.id} className="flex items-center gap-3 px-6 py-2.5 text-[13px]">
                  <span className="w-16 shrink-0 text-brand-mute">{formatDate(l.createdAt)}</span>
                  <span className="min-w-0 flex-1 truncate">{l.sourceName ?? l.note ?? l.kind.toLowerCase()}</span>
                  <span className="tabular-nums">{l.billedTo === "client_provider" ? `${(l.tokensIn + l.tokensOut).toLocaleString("en-GB")} tok` : `${l.amount > 0 ? "+" : ""}${Math.round(l.amount * 10) / 10}`}</span>
                </li>
              ))}
            </CardRows>
          )}
        </SectionCard>

        <SectionCard title="Account lead">
          {client.accountLead ? (
            <div className="flex items-center gap-3 px-6 py-5">
              <Avatar name={client.accountLead.user.name} size={40} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[15px]">{client.accountLead.user.name}</span>
                <span className="truncate text-[13px] text-brand-ink-2">{client.accountLead.user.email}</span>
              </div>
            </div>
          ) : (
            <CardNote>No account lead assigned yet.</CardNote>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Connections" meta={<span className="font-brand-mono text-[12px] text-brand-ink-2">OWNS THESE AD ACCOUNTS</span>}>
        <CardNote>
          Klingit&apos;s live ad accounts. Each feeds at most one client: only the owner&apos;s Insights and assistants read it. An account without an owner feeds nobody.
        </CardNote>
        <CardRows>
          {adAccounts.map((a) => {
            const mine = a.ownerId === clientId;
            return (
              <li key={a.provider} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-4">
                <span className="flex min-w-0 flex-1 basis-[220px] flex-col">
                  <span className="text-[15px]">{a.platform}</span>
                  <span className="text-[13px] text-brand-ink-2">{[a.accountId, a.configured ? (a.connectedAt ? `connected ${formatDate(a.connectedAt)}` : "connected") : "not connected"].filter(Boolean).join(" · ")}</span>
                </span>
                {!a.configured ? (
                  <StatusPill>Not connected</StatusPill>
                ) : mine ? (
                  <StatusPill tone="success">Owned by {client.name}</StatusPill>
                ) : a.ownerId ? (
                  <StatusPill>Owned by {a.ownerName ?? "another client"}</StatusPill>
                ) : (
                  <span className="inline-flex items-center gap-2 text-[14px] text-brand-ink">
                    <span aria-hidden className="size-2 rounded-full bg-brand-orange" />
                    Unassigned
                  </span>
                )}
                {a.configured && (mine || !a.ownerId) && (
                  <form action={setLiveAdsOwnerAction}>
                    <input type="hidden" name="clientId" value={clientId} />
                    <input type="hidden" name="provider" value={a.provider} />
                    <input type="hidden" name="assign" value={mine ? "0" : "1"} />
                    <Button type="submit" variant="secondary">
                      {mine ? "Unassign" : "Assign to this client"}
                    </Button>
                  </form>
                )}
              </li>
            );
          })}
        </CardRows>
        {adLog.length > 0 && (
          <ul className="m-0 flex list-none flex-col gap-1 border-t border-brand-line px-6 py-4 text-[13px] text-brand-ink-2">
            {adLog.map((l) => (
              <li key={l.id}>
                {formatDate(l.createdAt)} · {l.actorUserId ? (actors.get(l.actorUserId) ?? "Staff") : "System"}: {l.action}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard
        title="Client onboarding"
        meta={<StatusPill tone={client.onboardingCompletedAt ? "success" : "watch"}>{client.onboardingCompletedAt ? "Complete" : "Pending"}</StatusPill>}
      >
        <CardNote>
          {client.onboardingCompletedAt
            ? `Client completed their onboarding wizard on ${formatDate(client.onboardingCompletedAt)}.`
            : "Client hasn't completed the onboarding wizard yet. They'll see it on next sign-in."}
        </CardNote>
      </SectionCard>

      <SectionCard title="Client-side seats" meta={count(client.users.length)}>
        {client.users.length === 0 ? (
          <CardNote>No client-side users yet.</CardNote>
        ) : (
          <CardRows>
            {client.users.map((u) => (
              <li key={u.id} className="flex items-center gap-3 px-6 py-4">
                <Avatar name={u.user.name} size={32} />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px]">{u.user.name}</span>
                  <span className="truncate text-[13px] text-brand-ink-2">{u.user.email}</span>
                </div>
                <StatusPill>{CLIENT_PERMISSION_LABEL[u.permission]}</StatusPill>
              </li>
            ))}
          </CardRows>
        )}
      </SectionCard>

      <SectionCard title="Recent invoices" meta={client.invoices.length > 0 ? count(client.invoices.length) : undefined}>
        {client.invoices.length === 0 ? (
          <CardNote>No invoices issued to this client yet.</CardNote>
        ) : (
          <CardRows>
            {client.invoices.map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-4 text-[14px]">
                <span className="min-w-0 flex-1 font-brand-mono text-[12px]">{inv.number}</span>
                <span className="tabular-nums text-brand-ink-2">
                  {inv.currency} {inv.amount.toLocaleString()}
                </span>
                <StatusPill tone={INVOICE[inv.status]?.tone}>{INVOICE[inv.status]?.label ?? inv.status}</StatusPill>
              </li>
            ))}
          </CardRows>
        )}
      </SectionCard>

      <SectionCard title="Account actions">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-5">
          <p className="m-0 min-w-0 flex-1 basis-[260px] text-[14px] leading-[1.5] text-brand-ink-2">
            Pausing pauses new production; offboarding archives the account permanently.
          </p>
          <div className="flex flex-wrap gap-2">
            <form action={client.status === "PAUSED" ? reactivateClientAction : pauseClientAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <Button type="submit" variant="secondary">
                {client.status === "PAUSED" ? "Reactivate" : "Pause account"}
              </Button>
            </form>
            <form action={offboardClientAction}>
              <input type="hidden" name="clientId" value={clientId} />
              <Button type="submit" variant="secondary" className="text-ds-danger-text hover:border-ds-danger-text">
                Offboard
              </Button>
            </form>
          </div>
        </div>
      </SectionCard>
    </>
  );
}
