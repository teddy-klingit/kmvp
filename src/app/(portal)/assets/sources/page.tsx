import { getPortalViewer } from "@/lib/current-viewer";
import { listBrandConnections, listBrandSources } from "@/lib/brand-sources-data";
import { CONNECTABLE_APPS, appMeta, sectionLabel, type SourceApp } from "@/lib/brand-sources";
import { Card, CardHeader } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { EmptyState } from "@/components/ds/empty-state";
import { AppIcon } from "@/components/portal/brand-sources/app-icon";
import { ConnectModal } from "@/components/portal/brand-sources/connect-modal";
import { PasteLinkForm, SourceChip } from "@/components/portal/brand-sources/sources-row";
import { Link2 } from "lucide-react";

/** Brand OS → Sources: connect the apps where the brand lives, or paste any link. */
export default async function BrandSourcesPage({ searchParams }: { searchParams: Promise<{ connect?: string; step?: string }> }) {
  const { connect, step } = await searchParams;
  const viewer = await getPortalViewer();
  const [connections, sources] = await Promise.all([listBrandConnections(viewer.clientId), listBrandSources(viewer.clientId)]);
  const connectedApps = new Set(connections.map((c) => c.app));
  const linked = sources.filter((s) => !s.isDemo || connectedApps.has(s.app));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="m-0 text-[20px] font-semibold text-ds-text">Connected sources</h2>
        <p className="m-0 text-[14px] text-ds-text-2">Link where your brand lives. Klingit&apos;s agents use these as reference.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {CONNECTABLE_APPS.map((app) => {
          const isConnected = connectedApps.has(app.key);
          const count = sources.filter((s) => s.app === app.key).length;
          return (
            <Card key={app.key} as="article" aria-label={app.name} className="flex flex-col gap-4 p-5">
              <div className="flex items-start gap-3">
                <AppIcon app={app.key} size={20} tile />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold text-ds-text">{app.name}</span>
                  <span className="text-[13px] text-ds-text-2">{app.description}</span>
                </div>
              </div>
              <div className="mt-auto flex items-center justify-between gap-2">
                <StatusPill tone={isConnected ? "success" : "neutral"} dot={isConnected}>
                  {isConnected ? "Connected · demo" : "Not connected"}
                </StatusPill>
                <ConnectModal
                  app={app.key as Exclude<SourceApp, "web">}
                  connected={isConnected}
                  linkedCount={count}
                  open={connect === app.key}
                  initialStep={connect === app.key && step ? (Number(step) as 1 | 2 | 3) : isConnected ? 2 : 1}
                />
              </div>
              {isConnected && <span className="-mt-2 text-[12px] text-ds-text-3">Demo: no data is synced yet · {count} linked</span>}
            </Card>
          );
        })}

        <Card as="article" aria-label="Website / any link" className="flex flex-col gap-4 p-5 sm:col-span-2 xl:col-span-3 xl:flex-row xl:items-start xl:gap-6">
          <div className="flex items-start gap-3 xl:w-[300px] xl:shrink-0">
            <AppIcon app="web" size={20} tile />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[15px] font-semibold text-ds-text">{appMeta("web").name}</span>
              <span className="text-[13px] text-ds-text-2">{appMeta("web").description}</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <PasteLinkForm submitLabel="Add link" inline />
          </div>
        </Card>
      </div>

      <Card aria-label="Linked files">
        <CardHeader title="Linked files" meta={<StatusPill>{linked.length}</StatusPill>} action={<span className="text-[12px] text-ds-text-2">Click to open · × to remove</span>} />
        {linked.length === 0 ? (
          <EmptyState icon={Link2} title="Nothing linked yet" description="Connect an app or paste a link. Pin them to a Brand OS section with “Add source”." />
        ) : (
          <ul className="m-0 flex list-none flex-col divide-y divide-ds-divider p-0">
            {linked.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                <SourceChip source={s} />
                <span className="flex-1" />
                <span className="text-[12px] text-ds-text-2">{sectionLabel(s.section) ?? "Library"}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
