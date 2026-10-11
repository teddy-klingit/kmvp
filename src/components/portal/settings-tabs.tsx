"use client";

import { Bell, Gauge, LayoutGrid, Link2, ScrollText, Users } from "lucide-react";
import { SegmentedNav } from "@/components/ds/segmented-control";

/** The one tab bar on every settings page (nav v3, 08/09). Usage is the admins'; members get My usage. */
export function SettingsTabs({ admin }: { admin: boolean }) {
  const icon = "size-4 shrink-0";
  return (
    <SegmentedNav
      label="Settings"
      items={[
        { label: "Account & team", href: "/settings/account", icon: <Users className={icon} strokeWidth={1.75} /> },
        { label: "Notifications", href: "/settings/notifications", icon: <Bell className={icon} strokeWidth={1.75} /> },
        { label: "Connections", href: "/settings/connections", icon: <Link2 className={icon} strokeWidth={1.75} /> },
        { label: "Custom apps", href: "/settings/apps", icon: <LayoutGrid className={icon} strokeWidth={1.75} /> },
        { label: "Reporting", href: "/settings/reporting", icon: <ScrollText className={icon} strokeWidth={1.75} /> },
        { label: admin ? "Usage" : "My usage", href: "/settings/usage", icon: <Gauge className={icon} strokeWidth={1.75} /> },
      ]}
    />
  );
}
