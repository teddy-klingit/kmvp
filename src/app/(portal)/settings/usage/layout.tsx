import { getPortalViewer } from "@/lib/current-viewer";
import { isClientAdmin } from "@/lib/client-roles";
import { SettingsHeader } from "@/components/portal/settings-header";

/** Settings → Usage (admins: the whole account) or My usage (members: their own credits only). */
export default async function UsageLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getPortalViewer();
  const admin = isClientAdmin(viewer);
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader
        eyebrow={admin ? `${viewer.client.name} · visible to admins` : "Only your own credits"}
        title={admin ? "Usage" : "My usage"}
        {...(admin ? { chipsLabel: "Usage sections", chips: [{ label: "Credits", href: "/settings/usage" }, { label: "Billing", href: "/settings/usage/billing" }] } : {})}
      />
      {children}
    </div>
  );
}
