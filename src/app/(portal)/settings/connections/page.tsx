import { Image as ImageIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { listBrandConnections, listBrandSources } from "@/lib/brand-sources-data";
import { CONNECTABLE_APPS, appMeta, type SourceApp } from "@/lib/brand-sources";
import { AD_ACCOUNTS, AI_MODELS, type ConnectionMeta } from "@/lib/connections";
import { ownsLiveAds } from "@/lib/integrations/live-ads-owner";
import { planFor } from "@/lib/ai-credits";
import { formatDay } from "@/lib/project-state";
import { CardRows, SectionCard } from "@/components/ds/card";
import { pillClass } from "@/components/ds/button";
import { AppIcon } from "@/components/portal/brand-sources/app-icon";
import { ConnectModal } from "@/components/portal/brand-sources/connect-modal";
import { PasteLinkForm } from "@/components/portal/brand-sources/sources-row";
import { OwnModelDialog } from "@/components/portal/connections/own-model-dialog";
import { requestAdAccountAction, disconnectConnectionAction } from "@/lib/actions/connection-actions";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { PROMISES, SALES_SOURCES, stepsFor, type SalesHealth, type SalesSettings } from "@/lib/sales-sources";
import { SalesSetupButton } from "@/components/portal/connections/sales-setup-panel";
import { salesDisconnectAction, salesWaitlistAction } from "@/lib/actions/sales-connection-actions";

type Status = "CONNECTED" | "NEEDS_RECONNECT" | "REQUESTED" | "NONE" | "SETTING_UP" | "SOON" | "DISCONNECTED";
const STATUS: Record<Status, { label: string; dot: string }> = {
  CONNECTED: { label: "Connected", dot: "bg-[#8D9E47]" },
  NEEDS_RECONNECT: { label: "Needs reconnecting", dot: "bg-brand-orange" },
  REQUESTED: { label: "Requested · Klingit sets it up", dot: "bg-brand-ink" },
  NONE: { label: "Not connected", dot: "bg-brand-outline" },
  SETTING_UP: { label: "Setting up", dot: "bg-brand-orange" },
  SOON: { label: "Coming soon", dot: "bg-brand-outline" },
  DISCONNECTED: { label: "Disconnected", dot: "bg-brand-outline" },
};
const SALES_STATUS: Record<string, Status> = { connected: "CONNECTED", setting_up: "SETTING_UP", needs_reconnect: "NEEDS_RECONNECT", error: "NEEDS_RECONNECT", requested: "REQUESTED", disconnected: "DISCONNECTED" };
const ago = (d: Date, now = Date.now()) => {
  const m = Math.max(1, Math.round((now - d.getTime()) / 60000));
  return m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};
const FILES_FIRST = ["google_drive", "notion", "figma"];

/**
 * Settings → Connections (nav v3, 09; moved here from Brand OS → Sources): files & docs Klingit can read, ad
 * accounts for Insights and the Output library, and your own AI model (Basic only). Admins change them; everyone
 * else sees the state.
 */
export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<{ connect?: string; step?: string }> }) {
  const { connect, step } = await searchParams;
  const viewer = await getPortalViewer();
  const admin = isClientAdmin(viewer);
  const [connections, sources, rows, plan, dataSources] = await Promise.all([listBrandConnections(viewer.clientId), listBrandSources(viewer.clientId), prisma.brandConnection.findMany({ where: { clientId: viewer.clientId } }), planFor(viewer.client.planTier), prisma.dataSource.findMany({ where: { clientId: viewer.clientId, source: { in: SALES_SOURCES.map((s) => s.key) } } })]);
  const row = (app: string) => rows.find((r) => r.app === app);
  const statusOf = (app: string): Status => {
    const s = row(app)?.status;
    return s === "CONNECTED" || s === "NEEDS_RECONNECT" || s === "REQUESTED" ? s : "NONE";
  };
  const metaOf = (app: string) => (row(app)?.meta ?? {}) as ConnectionMeta;
  const connectedApps = new Set(connections.map((c) => c.app));
  const fileApps = [...FILES_FIRST.map((k) => CONNECTABLE_APPS.find((a) => a.key === k)!), ...CONNECTABLE_APPS.filter((a) => !FILES_FIRST.includes(a.key))];
  const shownFiles = fileApps.filter((a, i) => i < 3 || connectedApps.has(a.key));
  const moreFiles = fileApps.filter((a) => !shownFiles.includes(a));
  const ads = await Promise.all(AD_ACCOUNTS.map(async (a) => ({ ...a, status: (a.live && (await ownsLiveAds(viewer.clientId, a.live)) ? "CONNECTED" : statusOf(a.key)) as Status })));
  const fileMeta = (app: string) => {
    const m = metaOf(app);
    const n = sources.filter((s) => s.app === app).length;
    return [m.folders ? `${m.folders} folder${m.folders === 1 ? "" : "s"}` : m.workspace ?? (n ? `${n} linked` : null), m.lastSyncAt ? `synced ${formatDay(new Date(m.lastSyncAt))}` : null, row(app)?.isDemo ? "demo" : null].filter(Boolean).join(" · ");
  };

  // Sales & revenue (Phase V): where sales happen, so Insights can follow a click all the way to revenue.
  const sales = SALES_SOURCES.map((src) => {
    const ds = dataSources.find((d) => d.source === src.key) ?? null;
    const settings = (ds?.settings ?? null) as SalesSettings | null;
    const health = (ds?.health ?? null) as SalesHealth | null;
    const status: Status = src.soon ? "SOON" : ds ? (SALES_STATUS[ds.status] ?? "NONE") : "NONE";
    const steps = stepsFor(src.key);
    const step = settings?.step ? Math.min(settings.step, steps.length) : 1;
    const meta =
      status === "CONNECTED"
        ? [ds?.account, ds?.lastSyncAt ? `synced ${ago(ds.lastSyncAt)}` : null, health ? `${Math.round(health.withSource * 100)}% of ${health.of} have a source` : null].filter(Boolean).join(" · ")
        : status === "SETTING_UP"
          ? `Step ${step} of ${steps.length} · ${steps[step - 1].toLowerCase()}`
          : status === "NEEDS_RECONNECT"
            ? (ds?.lastError ?? "Access expired: reconnect to keep syncing")
            : status === "DISCONNECTED" && ds?.purgeAfter
              ? `Disconnected · synced data deleted by ${formatDay(ds.purgeAfter)}`
              : src.soon && ds?.status === "waitlist"
                ? "We'll tell you when it's ready"
                : null;
    return { src, ds, settings, health, status, meta };
  });

  return (
    <div className="flex flex-col gap-6">
      <SectionCard title="Sales & revenue" meta={<span className="rounded-full bg-brand-orange px-2 py-0.5 font-brand-mono text-[10px] uppercase text-white">New</span>}>
        <p className="m-0 border-b border-brand-line px-6 py-3.5 text-[14px] text-brand-ink-2">Connect where your sales happen, so Insights can follow a click all the way to revenue.</p>
        <CardRows>
          {sales.map(({ src, ds, settings, health, status, meta }) => (
            <Row key={src.key} accent={status === "SETTING_UP"} icon={<Monogram text={src.monogram} tone={src.tone} />} name={src.name} description={src.description} meta={meta} status={status}>
              {src.soon ? (
                ds?.status === "waitlist" ? null : (
                  <form action={salesWaitlistAction}>
                    <input type="hidden" name="source" value={src.key} />
                    <button type="submit" className={pillClass("secondary", "sm")}>
                      Tell me when it&apos;s ready
                    </button>
                  </form>
                )
              ) : admin ? (
                <span className="flex items-center gap-2">
                  {status !== "REQUESTED" && (
                    <SalesSetupButton
                      source={src.key}
                      name={src.name}
                      monogram={src.monogram}
                      tone={src.tone}
                      status={ds?.status ?? null}
                      settings={settings}
                      health={health}
                      demo={viewer.client.isDemo}
                      primary={status !== "CONNECTED"}
                      open={connect === src.key}
                      label={status === "CONNECTED" ? "Edit" : status === "SETTING_UP" ? "Continue" : status === "NEEDS_RECONNECT" ? "Reconnect" : "Connect"}
                    />
                  )}
                  {(status === "CONNECTED" || status === "SETTING_UP" || status === "NEEDS_RECONNECT") && (
                    <form action={salesDisconnectAction}>
                      <input type="hidden" name="source" value={src.key} />
                      <button type="submit" className={pillClass("secondary", "sm")}>
                        Disconnect
                      </button>
                    </form>
                  )}
                </span>
              ) : null}
            </Row>
          ))}
        </CardRows>
        <ul className="m-0 grid list-none grid-cols-1 gap-3 border-t border-brand-line px-6 py-4 text-[13px] sm:grid-cols-3">
          {PROMISES.map((p) => (
            <li key={p.title} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-[#8D9E47]" strokeWidth={2} />
              <span>
                <b className="font-semibold">{p.title}</b> {p.text}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>

      <SectionCard title="Files & docs" action={<Count n={shownFiles.filter((a) => connectedApps.has(a.key)).length} of={shownFiles.length} />}>
        <CardRows>
          {shownFiles.map((app) => (
            <Row key={app.key} icon={<AppIcon app={app.key} size={16} tile />} name={app.name} description={app.description} meta={connectedApps.has(app.key) ? fileMeta(app.key) : null} status={connectedApps.has(app.key) ? "CONNECTED" : "NONE"}>
              {admin && <ConnectModal app={app.key as Exclude<SourceApp, "web">} connected={connectedApps.has(app.key)} linkedCount={sources.filter((s) => s.app === app.key).length} open={connect === app.key} initialStep={connect === app.key && step ? (Number(step) as 1 | 2 | 3) : connectedApps.has(app.key) ? 2 : 1} />}
            </Row>
          ))}
        </CardRows>
        {(moreFiles.length > 0 || admin) && (
          <details className="border-t border-brand-line">
            <summary className="cursor-pointer px-6 py-3 font-brand-mono text-[12px] uppercase text-brand-ink">More apps and links</summary>
            <CardRows>
              {moreFiles.map((app) => (
                <Row key={app.key} icon={<AppIcon app={app.key} size={16} tile />} name={app.name} description={app.description} meta={null} status="NONE">
                  {admin && <ConnectModal app={app.key as Exclude<SourceApp, "web">} connected={false} linkedCount={0} open={connect === app.key} initialStep={1} />}
                </Row>
              ))}
            </CardRows>
            {admin && (
              <div className="flex flex-col gap-2 border-t border-brand-line px-6 py-4">
                <span className="text-[13px] text-brand-ink-2">{appMeta("web").description}</span>
                <PasteLinkForm submitLabel="Add link" />
              </div>
            )}
          </details>
        )}
      </SectionCard>

      <SectionCard title="Ad accounts" action={<Count n={ads.filter((a) => a.status === "CONNECTED").length} of={ads.length} />}>
        <CardRows>
          {ads.map((a) => {
            const m = metaOf(a.key);
            return (
              <Row key={a.key} icon={<Monogram text={a.monogram} />} name={a.name} description={a.description} meta={[m.accounts, m.note].filter(Boolean).join(" · ") || null} status={a.status}>
                {admin && (a.status === "CONNECTED" ? <Disconnect app={a.key} label="Manage" /> : a.status === "REQUESTED" ? null : <Request app={a.key} label={a.status === "NEEDS_RECONNECT" ? "Reconnect" : "Connect"} />)}
              </Row>
            );
          })}
        </CardRows>
      </SectionCard>

      <SectionCard title="Your own AI model" action={<span className="font-brand-mono text-[12px] uppercase text-brand-ink">Basic plan only</span>}>
        <p className="m-0 mx-6 mt-5 flex items-start gap-2 rounded-[10px] bg-brand-page px-4 py-3 text-[14px] leading-[1.5]">
          <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-[#8D9E47]" />
          {plan.ownModel ? (
            <span>
              You&apos;re on <b className="font-semibold">Basic</b>: connect your own model and your skills and assistants run on it. Your provider bills the tokens; Klingit shows how many were used.
            </span>
          ) : (
            <span>
              You&apos;re on <b className="font-semibold">{plan.name}</b>: skills use Klingit AI credits and assistants are included. On <b className="font-semibold">Basic</b>, connect your own model here and your provider bills the tokens.
            </span>
          )}
        </p>
        <CardRows>
          {AI_MODELS.map((m) => {
            const status = statusOf(m.key);
            return (
              <Row key={m.key} icon={<Monogram text={m.monogram} />} name={m.name} description={m.description} meta={status === "CONNECTED" && metaOf(m.key).last4 ? `Key ending ${metaOf(m.key).last4}${metaOf(m.key).addedAt ? ` · added ${formatDay(new Date(metaOf(m.key).addedAt!))}` : ""}` : null} status={status}>
                {admin && (status === "CONNECTED" ? <Disconnect app={m.key} label="Disconnect" /> : <OwnModelDialog app={m.key} name={m.name} basic={plan.ownModel} />)}
              </Row>
            );
          })}
        </CardRows>
      </SectionCard>

      <p className="m-0 flex flex-wrap items-center gap-3 rounded-[12px] border border-dashed border-brand-field px-5 py-3.5 text-[14px] text-brand-ink-2">
        <ImageIcon className="size-4" strokeWidth={1.75} />
        Moved here from Brand OS → Sources. Brand OS still shows which sources it learned from.
        {!admin && " Only your account's admins can change connections."}
      </p>
    </div>
  );
}

function Count({ n, of }: { n: number; of: number }) {
  return (
    <span className="font-brand-mono text-[12px] uppercase text-brand-ink">
      {n} of {of}
    </span>
  );
}

function Monogram({ text, tone }: { text: string; tone?: string }) {
  return <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[8px] font-brand-mono text-[12px] font-semibold", tone ?? "bg-brand-chip text-brand-ink")}>{text}</span>;
}

function Row({ icon, name, description, meta, status, accent, children }: { icon: React.ReactNode; name: string; description: string; meta: string | null; status: Status; accent?: boolean; children?: React.ReactNode }) {
  return (
    <li className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4", accent && "border-l-[3px] border-l-brand-orange bg-[#FBF7F2]")}>
      <span className="flex min-w-0 flex-1 basis-[260px] items-center gap-3">
        {icon}
        <span className="flex min-w-0 flex-col">
          <span className="text-[15px]">{name}</span>
          <span className="text-[13px] text-brand-ink-2">{description}</span>
          {meta && <span className="text-[12px] text-brand-mute">{meta}</span>}
        </span>
      </span>
      <span className={cn("inline-flex w-44 items-center gap-2 text-[14px]", status === "NEEDS_RECONNECT" ? "text-brand-ink" : "text-brand-ink-2")}>
        <span aria-hidden className={cn("size-2 rounded-full", STATUS[status].dot)} />
        {STATUS[status].label}
      </span>
      <span className="flex min-w-28 justify-end">{children}</span>
    </li>
  );
}

function Request({ app, label }: { app: string; label: string }) {
  return (
    <form action={requestAdAccountAction}>
      <input type="hidden" name="app" value={app} />
      <button type="submit" className={pillClass("primary", "sm")}>
        {label}
      </button>
    </form>
  );
}

function Disconnect({ app, label }: { app: string; label: string }) {
  return (
    <form action={disconnectConnectionAction}>
      <input type="hidden" name="app" value={app} />
      <button type="submit" className={pillClass("secondary", "sm")} title="Disconnect">
        {label}
      </button>
    </form>
  );
}
