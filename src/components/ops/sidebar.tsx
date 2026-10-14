"use client";

import { Home, Users, Building2, Tag, Bell, Inbox, CalendarDays, Receipt, Settings } from "lucide-react";
import { PersonaSwitcher } from "@/components/shared/persona-switcher";
import { AppNav, RailHint, type NavItem } from "@/components/shared/app-nav";
import type { RoleTier } from "@/lib/role-tier";

type TieredItem = NavItem & { tiers: RoleTier[] };

const MAIN: TieredItem[] = [
  { label: "Today", href: "/ops", icon: Home, tiers: ["ADMIN", "PM", "CREATOR"] },
  { label: "Clients", href: "/ops/clients", icon: Building2, tiers: ["ADMIN", "PM"] },
  { label: "Requests", href: "/ops/requests", icon: Inbox, tiers: ["ADMIN", "PM"] },
  { label: "Plan", href: "/ops/plan", icon: CalendarDays, tiers: ["ADMIN", "PM"] },
  { label: "Price List", href: "/ops/price-list", icon: Tag, tiers: ["ADMIN", "PM"] },
  { label: "Billing", href: "/ops/billing", icon: Receipt, tiers: ["ADMIN"] },
  { label: "Team", href: "/ops/team", icon: Users, tiers: ["ADMIN", "PM"] },
  { label: "Settings", href: "/ops/settings", icon: Settings, tiers: ["ADMIN"] },
];

/**
 * Ops nav (Phase S): Today (count badge) · Clients · Requests (pending badge) · Plan · Price List · Billing · Team ·
 * Settings. Projects are reached from Today, each client's Projects tab and Clients → All projects; Skills & AI,
 * Analytics, the old Plans page and the Archive are linked from Settings and Clients.
 */
export function OpsSidebar({
  userId,
  userName,
  userTitle,
  userEmail,
  tier,
  needsCount = 0,
  requestsCount = 0,
}: {
  userId: string;
  userName: string;
  userTitle: string;
  userEmail: string;
  tier: RoleTier;
  /** Today's items (Admin/PM, in their default view), shown as a badge on the home item. */
  needsCount?: number;
  /** Client requests waiting for a decision. */
  requestsCount?: number;
}) {
  const pick = (items: TieredItem[]) =>
    items
      .filter((i) => i.tiers.includes(tier))
      .map(({ label, href, icon }): NavItem => (href === "/ops" ? { label: tier === "CREATOR" ? "Home" : label, href, icon, badge: tier === "CREATOR" ? 0 : needsCount } : href === "/ops/requests" ? { label, href, icon, badge: requestsCount } : { label, href, icon }));
  return (
    <AppNav
      homeHref="/ops"
      tag="OPS"
      sections={[{ items: pick(MAIN) }]}
      bottom={[{ label: "Notifications", href: "/ops/notifications", icon: Bell }]}
      extra={<PersonaSwitcher currentEmail={userEmail} />}
      extraRail={
        <RailHint label="Switch view">
          <PersonaSwitcher currentEmail={userEmail} compact />
        </RailHint>
      }
      storageKey={userId}
      user={{ name: userName, sub: userTitle, href: "/ops/account" }}
    />
  );
}
