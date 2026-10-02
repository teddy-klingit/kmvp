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
} from "@/lib/actions/ops-client-admin-actions";

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

  const credits: Stat[] = [
    { label: "Monthly credit allowance", value: `${client.monthlyCreditAllowance}c` },
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
              {(["STARTER", "GROWTH", "SCALE"] as const).map((tier) => (
                <Button key={tier} type="submit" name="planTier" value={tier} size="sm" variant={client.planTier === tier ? "primary" : "secondary"} aria-pressed={client.planTier === tier}>
                  {PLAN_TIER_LABEL[tier]}
                </Button>
              ))}
            </form>
          </div>
          <StatRows rows={credits} />
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
