import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { OpsPage } from "@/components/ops/ops-page";
import { PageHeader } from "@/components/shared/page-header";
import { Card, SectionLabel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { INTERNAL_ROLE_LABEL } from "@/lib/labels";
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

export default async function WorkspaceSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ linkedin?: string; google?: string }>;
}) {
  const { linkedin, google } = await searchParams;
  const linkedInConnection = await prisma.integrationConnection.findUnique({ where: { provider: "linkedin" } });
  const googleAdsConnection = await prisma.integrationConnection.findUnique({ where: { provider: "google-ads" } });
  const metaConfigured = Boolean(process.env.META_ADS_ACCESS_TOKEN);
  const googleConfigured = Boolean(process.env.GOOGLE_ADS_DEVELOPER_TOKEN && process.env.GOOGLE_ADS_CLIENT_ID);
  const bigQueryConfigured = Boolean(process.env.GOOGLE_BIGQUERY_SERVICE_ACCOUNT_KEY);

  return (
    <OpsPage>
      <div className="flex flex-col gap-6">
        <PageHeader title="Workspace settings" actions={<div />} />

        {linkedin === "connected" && (
          <Card className="border-l-4 border-l-success p-4">
            <p className="text-sm font-medium">LinkedIn connected successfully.</p>
          </Card>
        )}
        {linkedin === "error" && (
          <Card className="border-l-4 border-l-danger p-4">
            <p className="text-sm font-medium">Couldn&apos;t connect LinkedIn — the authorization was cancelled or failed.</p>
          </Card>
        )}
        {google === "connected" && (
          <Card className="border-l-4 border-l-success p-4">
            <p className="text-sm font-medium">Google Ads connected successfully.</p>
          </Card>
        )}
        {google === "error" && (
          <Card className="border-l-4 border-l-danger p-4">
            <p className="text-sm font-medium">Couldn&apos;t connect Google Ads — the authorization was cancelled or failed.</p>
          </Card>
        )}

        <div className="flex flex-col gap-3">
          <SectionLabel>Ad platform connections</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm font-semibold">Meta Ads</p>
                <p className="text-sm text-muted-foreground">Powers live campaign performance in client Insights.</p>
              </div>
              {metaConfigured ? <Badge tone="success">Connected</Badge> : <Badge tone="neutral">Not configured</Badge>}
            </Card>
            <Card className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm font-semibold">LinkedIn Ads</p>
                <p className="text-sm text-muted-foreground">
                  {linkedInConnection
                    ? `Connected ${formatDate(linkedInConnection.connectedAt, { day: "2-digit", month: "short" })}`
                    : "Powers live campaign performance in client Insights."}
                </p>
              </div>
              {linkedInConnection ? (
                <Badge tone="success">Connected</Badge>
              ) : (
                <Button asChild size="sm" variant="secondary">
                  <Link href="/api/integrations/linkedin/connect">Connect</Link>
                </Button>
              )}
            </Card>
            <Card className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm font-semibold">Google Ads</p>
                <p className="text-sm text-muted-foreground">
                  {!googleConfigured
                    ? "Needs GOOGLE_ADS_DEVELOPER_TOKEN + OAuth client credentials configured first."
                    : googleAdsConnection
                      ? `Connected ${formatDate(googleAdsConnection.connectedAt, { day: "2-digit", month: "short" })}`
                      : "Powers live campaign performance in client Insights."}
                </p>
              </div>
              {googleAdsConnection ? (
                <Badge tone="success">Connected</Badge>
              ) : googleConfigured ? (
                <Button asChild size="sm" variant="secondary">
                  <Link href="/api/integrations/google-ads/connect">Connect</Link>
                </Button>
              ) : (
                <Badge tone="neutral">Not configured</Badge>
              )}
            </Card>
            <Card className="flex items-center justify-between p-5">
              <div>
                <p className="text-sm font-semibold">Google Ads Transparency (competitor data)</p>
                <p className="text-sm text-muted-foreground">
                  BigQuery service account — powers competitor ad data from Google in Market Intelligence. Billed to a GCP project, no per-user connect step.
                </p>
              </div>
              {bigQueryConfigured ? <Badge tone="success">Configured</Badge> : <Badge tone="neutral">Not configured</Badge>}
            </Card>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Integrations</SectionLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {INTEGRATIONS.map((i) => (
              <Card key={i.name} className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm font-semibold">{i.name}</p>
                  <p className="text-sm text-muted-foreground">{i.detail}</p>
                </div>
                {i.connected ? <Badge tone="success">Connected</Badge> : <Button size="sm" variant="secondary">Connect</Button>}
              </Card>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Security policy</SectionLabel>
          <Card className="flex flex-col gap-4 p-5">
            <div className="flex items-center justify-between text-sm">
              <span>Require 2FA for all internal staff</span>
              <Badge tone="success">Enabled</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>Session timeout</span>
              <span className="text-muted-foreground">12 hours</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>SSO (Google Workspace)</span>
              <Badge tone="neutral">Not configured</Badge>
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-3">
          <SectionLabel>Internal roles &amp; permissions</SectionLabel>
          <Card className="divide-y divide-border p-0">
            {ROLE_PERMISSIONS.map((r) => (
              <div key={r.role} className="flex flex-col gap-1.5 px-5 py-3.5">
                <p className="text-sm font-semibold">{INTERNAL_ROLE_LABEL[r.role]}</p>
                <div className="flex flex-wrap gap-1.5">
                  {r.can.map((c) => (
                    <Badge key={c} tone="neutral">
                      {c}
                    </Badge>
                  ))}
                </div>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </OpsPage>
  );
}
