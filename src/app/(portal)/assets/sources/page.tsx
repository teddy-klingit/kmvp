import { getPortalViewer } from "@/lib/current-viewer";
import { listBrandConnections, listBrandSources } from "@/lib/brand-sources-data";
import { CONNECTABLE_APPS, appMeta, sectionLabel, type SourceApp } from "@/lib/brand-sources";
import { Card, CardHeader, CardNote, CardRows, SectionCard } from "@/components/ds/card";
import { StatusPill } from "@/components/ds/status-pill";
import { PageGrid } from "@/components/ds/page-grid";
import { AppIcon } from "@/components/portal/brand-sources/app-icon";
import { ConnectModal } from "@/components/portal/brand-sources/connect-modal";
import { PasteLinkForm, SourceChip } from "@/components/portal/brand-sources/sources-row";

/** Brand OS → Sources: connect the apps where the brand lives, or paste any link. */
export default async function BrandSourcesPage({ searchParams }: { searchParams: Promise<{ connect?: string; step?: string }> }) {
  const { connect, step } = await searchParams;
  const viewer = await getPortalViewer();
  const [connections, sources] = await Promise.all([listBrandConnections(viewer.clientId), listBrandSources(viewer.clientId)]);
  const connectedApps = new Set(connections.map((c) => c.app));
  const linked = sources.filter((s) => !s.isDemo || connectedApps.has(s.app));

  return (
    <PageGrid
      main={
        <>
          <SectionCard title="Apps" action={<span className="font-brand-mono text-[12px] text-brand-ink-2">{CONNECTABLE_APPS.filter((a) => connectedApps.has(a.key)).length} OF {CONNECTABLE_APPS.length} CONNECTED</span>}>
            <CardRows>
              {CONNECTABLE_APPS.map((app) => {
                const isConnected = connectedApps.has(app.key);
                const count = sources.filter((s) => s.app === app.key).length;
                return (
                  <li key={app.key} aria-label={app.name} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
                    <div className="flex min-w-0 flex-1 basis-[260px] items-start gap-3">
                      <AppIcon app={app.key} size={18} tile />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="text-[15px] text-brand-ink">{app.name}</span>
                        <span className="text-[13px] leading-[1.5] text-brand-ink-2">{app.description}</span>
                        {isConnected && <span className="text-[12px] text-brand-ink-2">Demo: no data is synced yet · {count} linked</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
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
                  </li>
                );
              })}
            </CardRows>
          </SectionCard>

          <SectionCard
            title="Linked files"
            meta={linked.length > 0 ? <span className="font-brand-mono text-[12px] text-brand-ink-2">{linked.length}</span> : undefined}
            action={linked.length > 0 ? <span className="text-[12px] text-brand-ink-2">Click to open · × to remove</span> : undefined}
          >
            {linked.length === 0 ? (
              <CardNote>Nothing linked yet. Connect an app or paste a link, then pin them to a Brand OS section with “Add source”.</CardNote>
            ) : (
              <CardRows>
                {linked.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                    <SourceChip source={s} />
                    <span className="flex-1" />
                    <span className="text-[12px] text-brand-ink-2">{sectionLabel(s.section) ?? "Library"}</span>
                  </li>
                ))}
              </CardRows>
            )}
          </SectionCard>
        </>
      }
      side={
        <Card aria-label="Website / any link">
          <CardHeader title={appMeta("web").name} />
          <div className="flex flex-col gap-4 px-6 py-5">
            <div className="flex items-start gap-3">
              <AppIcon app="web" size={18} tile />
              <span className="min-w-0 flex-1 text-[13px] leading-[1.5] text-brand-ink-2">{appMeta("web").description}</span>
            </div>
            <PasteLinkForm submitLabel="Add link" />
          </div>
        </Card>
      }
    />
  );
}
