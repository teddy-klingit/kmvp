import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { NavTabs } from "@/components/ui/nav-tabs";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PersonAvatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { PLAN_TIER_LABEL, CLIENT_PERMISSION_LABEL } from "@/lib/labels";
import {
  updateClientPlanAction,
  pauseClientAction,
  reactivateClientAction,
  offboardClientAction,
} from "@/lib/actions/ops-client-admin-actions";

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

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader
          title={
            <span className="flex items-center gap-3">
              {client.name} — Admin
              <Badge tone={client.status === "ACTIVE" ? "success" : client.status === "PAUSED" ? "warning" : "neutral"}>
                {client.status}
              </Badge>
            </span>
          }
          actions={<div />}
        />
        <NavTabs
          items={[
            { label: "Workspace", href: `/ops/clients/${clientId}/dashboard` },
            { label: "Admin", href: `/ops/clients/${clientId}/admin` },
            { label: "Brand OS", href: `/ops/clients/${clientId}/brand-os` },
            { label: "Custom apps", href: `/ops/clients/${clientId}/custom-apps` },
            { label: "Content plan", href: `/ops/clients/${clientId}/content-plan` },
          ]}
        />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <SectionLabel>Plan &amp; billing</SectionLabel>
            <Card className="flex flex-col gap-4 p-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Plan tier</span>
                <form action={updateClientPlanAction} className="flex gap-2">
                  <input type="hidden" name="clientId" value={clientId} />
                  {(["STARTER", "GROWTH", "SCALE"] as const).map((tier) => (
                    <Button key={tier} type="submit" name="planTier" value={tier} size="sm" variant={client.planTier === tier ? "primary" : "outline"}>
                      {PLAN_TIER_LABEL[tier]}
                    </Button>
                  ))}
                </form>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Monthly credit allowance</span>
                <span className="font-medium">{client.monthlyCreditAllowance}c</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Current balance</span>
                <span className="font-medium">{client.creditBalance}c</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Renewal date</span>
                <span className="font-medium">{client.renewalDate && formatDate(client.renewalDate)}</span>
              </div>
            </Card>
          </div>

          <div className="flex flex-col gap-3">
            <SectionLabel>Account lead</SectionLabel>
            <Card className="flex items-center gap-3 p-5">
              {client.accountLead && (
                <>
                  <PersonAvatar name={client.accountLead.user.name} />
                  <div>
                    <p className="text-sm font-medium">{client.accountLead.user.name}</p>
                    <p className="text-xs text-muted-foreground">{client.accountLead.user.email}</p>
                  </div>
                </>
              )}
            </Card>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Client onboarding</SectionLabel>
          <Card className="flex items-center justify-between p-5">
            <p className="text-sm text-muted-foreground">
              {client.onboardingCompletedAt
                ? `Client completed their onboarding wizard on ${formatDate(client.onboardingCompletedAt)}.`
                : "Client hasn't completed the onboarding wizard yet — they'll see it on next sign-in."}
            </p>
            <Badge tone={client.onboardingCompletedAt ? "success" : "warning"}>
              {client.onboardingCompletedAt ? "Complete" : "Pending"}
            </Badge>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Client-side seats</SectionLabel>
          <Card className="divide-y divide-border p-0">
            {client.users.map((u) => (
              <div key={u.id} className="flex items-center justify-between px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <PersonAvatar name={u.user.name} size="sm" />
                  <div>
                    <p className="text-sm font-medium">{u.user.name}</p>
                    <p className="text-xs text-muted-foreground">{u.user.email}</p>
                  </div>
                </div>
                <Badge tone="neutral">{CLIENT_PERMISSION_LABEL[u.permission]}</Badge>
              </div>
            ))}
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Recent invoices</SectionLabel>
          <Card className="divide-y divide-border p-0">
            {client.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-5 py-3.5 text-sm">
                <span className="font-medium">{inv.number}</span>
                <span className="text-muted-foreground">
                  {inv.currency} {inv.amount.toLocaleString()}
                </span>
                <Badge tone="neutral">{inv.status}</Badge>
              </div>
            ))}
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Account actions</SectionLabel>
          <Card className="flex items-center justify-between gap-4 p-5">
            <p className="text-sm text-muted-foreground">
              Pausing pauses new production; offboarding archives the account permanently.
            </p>
            <div className="flex gap-2">
              <form action={client.status === "PAUSED" ? reactivateClientAction : pauseClientAction}>
                <input type="hidden" name="clientId" value={clientId} />
                <Button type="submit" variant="secondary">
                  {client.status === "PAUSED" ? "Reactivate" : "Pause account"}
                </Button>
              </form>
              <form action={offboardClientAction}>
                <input type="hidden" name="clientId" value={clientId} />
                <Button type="submit" variant="destructive">
                  Offboard
                </Button>
              </form>
            </div>
          </Card>
        </div>
      </div>
    </OpsPage>
  );
}
