import { SettingsHeader } from "@/components/portal/settings-header";

/** Settings → Connections (moved here from Brand OS → Sources): the apps Klingit can read from. */
export default function ConnectionsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6">
      <SettingsHeader eyebrow="Apps Klingit can read from · admins can change" title="Connections" />
      {children}
    </div>
  );
}
