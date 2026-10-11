import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { PageHeader } from "@/components/ds/page-header";
import { RouteChips } from "@/components/ds/route-chips";
import { SettingsTabs } from "@/components/portal/settings-tabs";

/**
 * Settings pages (reached from the profile menu): the page header, the shared settings tab bar, and optionally a
 * second level as chips (Account & team: Profile & plan · Team · Security; Reporting: Weekly · Monthly · Custom).
 */
export async function SettingsHeader({
  title,
  eyebrow,
  actions,
  chips,
  chipsLabel,
}: {
  title: string;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  chips?: { label: string; href: string; also?: string[] }[];
  chipsLabel?: string;
}) {
  const viewer = await getPortalViewer();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={eyebrow} title={title} actions={actions} />
      <SettingsTabs admin={isClientAdmin(viewer)} />
      {chips && <RouteChips label={chipsLabel ?? title} items={chips} />}
    </div>
  );
}
