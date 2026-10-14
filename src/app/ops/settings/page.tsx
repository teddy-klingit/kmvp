import Link from "next/link";
import { requireOpsPage } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { listLiveAdAccounts } from "@/lib/integrations/live-ads-owner";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/ds/page-header";
import { Card, SectionCard, CardRows, CardNote } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { Button } from "@/components/ds/button";
import { PillLink } from "@/components/ds/pill-link";
import { INTERNAL_ROLE_LABEL, PLAN_TIER_LABEL } from "@/lib/labels";
import { DEFAULT_ACTIVE_SLOTS } from "@/lib/active-slots";
import { setPlanSlotsAction } from "@/lib/actions/plan-actions";
import { formatDate } from "@/lib/utils";
import { removeKeyMomentAction, saveKeyMomentAction, saveLeadTimeAction } from "@/lib/actions/ops-plan-actions";

const INTEGRATIONS = [
  { name: "Slack", detail: "Pipeline notifications mirrored into client channels", connected: true },
  { name: "Figma", detail: "Component library sync for Brand OS + templates", connected: true },
  { name: "Google Drive", detail: "Raw asset backups and shared folders", connected: false },
  { name: "Accounting (Xero)", detail: "Invoice sync for finance reconciliation", connected: false },
];

const ROLE_PERMISSIONS: { role: keyof typeof INTERNAL_ROLE_LABEL; can: string[] }[] = [
  { role: "ADMIN", can: ["Manage billing", "Manage skills & AI", "Manage all clients", "Manage staff"] },
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
  const [leadTimes, moments] = await Promise.all([prisma.planLeadTime.findMany({ orderBy: { sortOrder: "asc" } }), prisma.keyMoment.findMany({ where: { date: { gte: daysAgo(30) } }, orderBy: { date: "asc" } })]);
  // Live ad accounts belong to one client only (live-ads-owner.ts).
  const owners = (await listLiveAdAccounts()).filter((a) => a.configured);
  const slotsFor = (tier: keyof typeof DEFAULT_ACTIVE_SLOTS) => plans.find((p) => p.tier === tier)?.activeSlots ?? DEFAULT_ACTIVE_SLOTS[tier];
  const adConnected = [metaConfigured, Boolean(linkedInConnection), Boolean(googleAdsConnection), bigQueryConfigured].filter(Boolean).length;

  return (
    <OpsPage>
      <PageHeader eyebrow={`${adConnected} of 4 ad sources connected`} title="Workspace settings" />

      {linkedin === "connected" && <Notice ok>LinkedIn connected successfully.</Notice>}
      {linkedin === "error" && <Notice ok={false}>Couldn&apos;t connect LinkedIn. The authorization was cancelled or failed.</Notice>}
      {google === "connected" && <Notice ok>Google Ads connected successfully.</Notice>}
      {google === "error" && <Notice ok={false}>Couldn&apos;t connect Google Ads. The authorization was cancelled or failed.</Notice>}

      {/* Plan (Phase R): lead times give clients their brief-by dates; key moments show on every client's Plan. */}
      <SectionCard title="Plan · lead times" meta={<span className="text-[12px] text-brand-ink-2">Working days Klingit needs per format, and ≈ team credits · placeholders</span>}>
        <ul className="m-0 flex list-none flex-col p-0">
          {[...leadTimes, null].map((l) => (
            <li key={l?.id ?? "new"} className="border-b border-brand-line px-6 py-3 last:border-b-0">
              <form action={saveLeadTimeAction} className="flex flex-wrap items-center gap-3 text-[14px]">
                {l && <input type="hidden" name="id" value={l.id} />}
                <input name="format" required defaultValue={l?.format} placeholder="New format" aria-label="Format" className="h-9 w-40 rounded-[8px] border border-brand-outline px-3" />
                <label className="flex items-center gap-2 text-brand-ink-2">
                  <input name="workingDays" type="number" min={1} required defaultValue={l?.workingDays} className="h-9 w-16 rounded-[8px] border border-brand-outline px-2 text-brand-ink" /> working days
                </label>
                <label className="flex items-center gap-2 text-brand-ink-2">
                  ≈ <input name="teamCredits" type="number" min={0} step="0.5" defaultValue={l?.teamCredits ?? ""} className="h-9 w-16 rounded-[8px] border border-brand-outline px-2 text-brand-ink" /> team credits
                </label>
                <button type="submit" className="text-[13px] underline underline-offset-2">
                  {l ? "Save" : "Add"}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Plan · key moments" meta={<span className="text-[12px] text-brand-ink-2">{moments.length} · holidays and shopping days per market</span>}>
        <ul className="m-0 flex max-h-[360px] list-none flex-col overflow-y-auto p-0">
          {moments.map((m) => (
            <li key={m.id} className="flex items-center gap-3 border-b border-brand-line px-6 py-2.5 text-[14px]">
              <span className="w-28 shrink-0 text-brand-ink-2">{m.date.toISOString().slice(0, 10)}</span>
              <span className="flex-1">{m.name}</span>
              <span className="text-[13px] text-brand-ink-2">{(m.markets as string[]).join(" ")} · {m.kind}</span>
              <form action={removeKeyMomentAction}>
                <input type="hidden" name="id" value={m.id} />
                <button type="submit" className="text-[13px] text-ds-danger-text underline underline-offset-2">
                  Remove
                </button>
              </form>
            </li>
          ))}
        </ul>
        <form action={saveKeyMomentAction} className="flex flex-wrap items-center gap-3 border-t border-brand-line px-6 py-4 text-[14px]">
          <input name="name" required placeholder="Name" aria-label="Name" className="h-9 w-44 rounded-[8px] border border-brand-outline px-3" />
          <input name="date" type="date" required aria-label="Date" className="h-9 rounded-[8px] border border-brand-outline px-2" />
          {["SE", "NO", "DK", "FI"].map((mk) => (
            <label key={mk} className="flex items-center gap-1">
              <input type="checkbox" name="markets" value={mk} defaultChecked /> {mk}
            </label>
          ))}
          <select name="kind" aria-label="Kind" className="h-9 rounded-[8px] border border-brand-outline px-2">
            <option value="holiday">Holiday</option>
            <option value="shopping">Shopping day</option>
          </select>
          <button type="submit" className="text-[13px] underline underline-offset-2">
            Add
          </button>
        </form>
      </SectionCard>

      <SectionCard title="Plans · active slots">
        <CardNote>
          Plans (active slots, AI and team credits, prices) and AI-credit bundles moved to{" "}
          <Link href="/ops/plans" className="text-brand-ink underline underline-offset-2">
            Plans &amp; AI credits
          </Link>
          .
        </CardNote>
      </SectionCard>

      <SectionCard title="Ad platform connections">
        <p className="m-0 border-b border-brand-line px-6 py-4 text-[14px] text-brand-ink-2">
          {owners.map((a) => `${a.platform}: ${a.ownerName ?? "no owner, feeds no client"}`).join(" · ") || "No live ad accounts connected."} Owners are set on each client&apos;s admin page under Connections.
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

/** Key moments from a month back on. */
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000);
}
