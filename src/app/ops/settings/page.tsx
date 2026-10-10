import { requireOpsPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { liveAdsOwner } from "@/lib/integrations/live-ads-owner";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { Card, SectionCard, CardRows } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { Button } from "@/components/ds/button";
import { PillLink } from "@/components/ds/pill-link";
import { INTERNAL_ROLE_LABEL, PLAN_TIER_LABEL } from "@/lib/labels";
import { DEFAULT_ACTIVE_SLOTS } from "@/lib/active-slots";
import { setPlanSlotsAction } from "@/lib/actions/plan-actions";
import { formatDate } from "@/lib/utils";

const INTEGRATIONS = [
  { name: "Slack", detail: "Pipeline notifications mirrored into client channels", connected: true },
  { name: "Figma", detail: "Component library sync for Brand OS + templates", connected: true },
  { name: "Google Drive", detail: "Raw asset backups and shared folders", connected: false },
  { name: "Accounting (Xero)", detail: "Invoice sync for finance reconciliation", connected: false },
];

const ROLE_PERMISSIONS: { role: keyof typeof INTERNAL_ROLE_LABEL; can: string[] }[] = [
  { role: "ADMIN", can: ["Manage billing", "Manage agents", "Manage all clients", "Manage staff"] },
  { role: "ACCOUNT_LEAD", can: ["Manage assigned clients", "Send estimates", "Approve delivery"] },
  { role: "ART_DIRECTOR", can: ["Approve production batches", "Assign creative tasks"] },
  { role: "PROJECT_MANAGER", can: ["Manage pipeline stages", "Resolve QA flags"] },
];

/** One connection row: name and one-line detail on the left, its state or Connect on the right. */
function ConnectionRow({ name, detail, children }: { name: string; detail: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
      <div className="flex min-w-0 flex-1 basis-[260px] flex-col gap-0.5">
        <span className="text-[15px]">{name}</span>
        <span className="text-[13px] leading-[1.5] text-brand-ink-2">{detail}</span>
      </div>
      <span className="shrink-0">{children}</span>
    </li>
  );
}

function Notice({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <Card as="div" className="flex items-center gap-3 px-6 py-4" role="status">
      <StatusPill tone={ok ? "success" : "danger"} dot>
        {ok ? "Connected" : "Failed"}
      </StatusPill>
      <p className="m-0 text-[14px]">{children}</p>
    </Card>
  );
}

export default async function WorkspaceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ linkedin?: string; google?: string }>;
}) {
  await requireOpsPage(["ADMIN"]);
  const { linkedin, google } = await searchParams;
  const linkedInConnection = await prisma.integrationConnection.findUnique({ where: { provider: "linkedin" } });
  const googleAdsConnection = await prisma.integrationConnection.findUnique({ where: { provider: "google-ads" } });
  const metaConfigured = Boolean(process.env.META_ADS_ACCESS_TOKEN);
  const googleConfigured = Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_CLIENT_ID);
  const bigQueryConfigured = Boolean(process.env.GOOGLE_BIGQUERY_SERVICE_ACCOUNT_KEY);
  const plans = await prisma.plan.findMany();
  // Live ad accounts belong to one client only (live-ads-owner.ts).
  const ownerId = await liveAdsOwner("meta");
  const owner = ownerId ? await prisma.client.findUnique({ where: { id: ownerId }, select: { name: true } }) : null;
  const slotsFor = (tier: keyof typeof DEFAULT_ACTIVE_SLOTS) => plans.find((p) => p.tier === tier)?.activeSlots ?? DEFAULT_ACTIVE_SLOTS[tier];
  const adConnected = [metaConfigured, Boolean(linkedInConnection), Boolean(googleAdsConnection), bigQueryConfigured].filter(Boolean).length;

  return (
    <OpsPage>
      <PageHeader eyebrow={`${adConnected} of 4 ad sources connected`} title="Workspace settings" />

      {linkedin === "connected" && <Notice ok>LinkedIn connected successfully.</Notice>}
      {linkedin === "error" && <Notice ok={false}>Couldn&apos;t connect LinkedIn. The authorization was cancelled or failed.</Notice>}
      {google === "connected" && <Notice ok>Google Ads connected successfully.</Notice>}
      {google === "error" && <Notice ok={false}>Couldn&apos;t connect Google Ads. The authorization was cancelled or failed.</Notice>}

      <SectionCard title="Plans · active slots" meta={<span className="text-[13px] text-brand-ink-2">Projects Klingit runs at once per client; the rest queue</span>}>
        <CardRows>
          {(Object.keys(DEFAULT_ACTIVE_SLOTS) as (keyof typeof DEFAULT_ACTIVE_SLOTS)[]).map((tier) => (
            <li key={tier} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
              <span className="min-w-0 flex-1 text-[15px]">{PLAN_TIER_LABEL[tier]}</span>
              <form action={setPlanSlotsAction} className="flex items-center gap-2">
                <input type="hidden" name="tier" value={tier} />
                <label className="sr-only" htmlFor={`slots-${tier}`}>
                  Active slots on {PLAN_TIER_LABEL[tier]}
                </label>
                <input id={`slots-${tier}`} name="activeSlots" type="number" min={1} max={50} defaultValue={slotsFor(tier)} className="h-9 w-20 rounded-[8px] border border-brand-outline bg-white px-3 text-[14px] outline-none focus:border-brand-ink" />
                <Button type="submit" size="sm" variant="secondary">
                  Save
                </Button>
              </form>
            </li>
          ))}
        </CardRows>
      </SectionCard>

      <SectionCard title="Ad platform connections">
        <p className="m-0 border-b border-brand-line px-6 py-4 text-[14px] text-brand-ink-2">
          {owner
            ? `These accounts belong to ${owner.name}. Only ${owner.name}'s Insights and assistants read them.`
            : "These accounts don't belong to any client yet, so no client reads them. Set LIVE_ADS_CLIENT_ID to the client's id."}
        </p>
        <CardRows>
          <ConnectionRow name="Meta Ads" detail="Powers live campaign performance in client Insights.">
            {metaConfigured ? <StatusPill tone="success">Connected</StatusPill> : <StatusPill>Not configured</StatusPill>}
          </ConnectionRow>
          <ConnectionRow
            name="LinkedIn Ads"
            detail={
              linkedInConnection
                ? `Connected ${formatDate(linkedInConnection.connectedAt, { day: "2-digit", month: "short" })}`
                : "Powers live campaign performance in client Insights."
            }
          >
            {linkedInConnection ? (
              <StatusPill tone="success">Connected</StatusPill>
            ) : (
              <PillLink href="/api/integrations/linkedin/connect" size="sm">
                Connect
              </PillLink>
            )}
          </ConnectionRow>
          <ConnectionRow
            name="Google Ads"
            detail={
              !googleConfigured
                ? "Needs GOOGLE_ADS_DEVELOPER_TOKEN + OAuth client credentials configured first."
                : googleAdsConnection
                  ? `Connected ${formatDate(googleAdsConnection.connectedAt, { day: "2-digit", month: "short" })}`
                  : "Powers live campaign performance in client Insights."
            }
          >
            {googleAdsConnection ? (
              <StatusPill tone="success">Connected</StatusPill>
            ) : googleConfigured ? (
              <PillLink href="/api/integrations/google-ads/connect" size="sm">
                Connect
              </PillLink>
            ) : (
              <StatusPill>Not configured</StatusPill>
            )}
          </ConnectionRow>
          <ConnectionRow
            name="Google Ads Transparency (competitor data)"
            detail="BigQuery service account: powers competitor ad data from Google in Market Intelligence. Billed to a GCP project, no per-user connect step."
          >
            {bigQueryConfigured ? <StatusPill tone="success">Configured</StatusPill> : <StatusPill>Not configured</StatusPill>}
          </ConnectionRow>
        </CardRows>
      </SectionCard>

      <SectionCard title="Integrations">
        <CardRows>
          {INTEGRATIONS.map((i) => (
            <ConnectionRow key={i.name} name={i.name} detail={i.detail}>
              {i.connected ? (
                <StatusPill tone="success">Connected</StatusPill>
              ) : (
                <Button size="sm" variant="secondary">
                  Connect
                </Button>
              )}
            </ConnectionRow>
          ))}
        </CardRows>
      </SectionCard>

      <SectionCard title="Security policy">
        <CardRows>
          <li className="flex items-center justify-between gap-4 px-6 py-4 text-[14px]">
            <span>Require 2FA for all internal staff</span>
            <StatusPill tone="success">Enabled</StatusPill>
          </li>
          <li className="flex items-center justify-between gap-4 px-6 py-4 text-[14px]">
            <span>Session timeout</span>
            <span className="tabular-nums text-brand-ink-2">12 hours</span>
          </li>
          <li className="flex items-center justify-between gap-4 px-6 py-4 text-[14px]">
            <span>SSO (Google Workspace)</span>
            <StatusPill>Not configured</StatusPill>
          </li>
        </CardRows>
      </SectionCard>

      <SectionCard title="Internal roles & permissions">
        <CardRows>
          {ROLE_PERMISSIONS.map((r) => (
            <li key={r.role} className="flex flex-col gap-2 px-6 py-4">
              <span className="text-[15px]">{INTERNAL_ROLE_LABEL[r.role]}</span>
              <span className="flex flex-wrap gap-1.5">
                {r.can.map((c) => (
                  <StatusPill key={c}>{c}</StatusPill>
                ))}
              </span>
            </li>
          ))}
        </CardRows>
      </SectionCard>
    </OpsPage>
  );
}
