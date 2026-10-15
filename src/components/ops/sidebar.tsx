"use client";

import { Home, Users, Building2, Bell, CalendarDays, Settings } from "lucide-react";
import { PersonaSwitcher } from "@/components/shared/persona-switcher";
import { AppNav, RailHint, type NavItem } from "@/components/shared/app-nav";
import type { RoleTier } from "@/lib/role-tier";

type TieredItem = NavItem & { tiers: RoleTier[] };

const MAIN: TieredItem[] = [
  { label: "Today", href: "/ops", icon: Home, tiers: ["ADMIN", "PM", "CREATOR"] },
  { label: "Clients", href: "/ops/clients", icon: Building2, tiers: ["ADMIN", "PM"] },
  { label: "Planner", href: "/ops/planner", icon: CalendarDays, tiers: ["ADMIN", "PM"] },
  { label: "Team", href: "/ops/team", icon: Users, tiers: ["ADMIN", "PM"] },
];

/**
 * Ops nav (Phase T): Today (my open tasks) · Clients · Planner · Team, then under the divider Admin (admins only, with
 * open set-up jobs) and Notifications. Requests live in Today; Price List, Billing, Migration and Plans & settings
 * are Admin tabs. Projects are reached from Today, each client's Projects tab and Clients → All projects.
 */
export function OpsSidebar({
  userId,
  userName,
  userTitle,
  userEmail,
  tier,
  needsCount = 0,
  admin = false,
  adminCount = 0,
}: {
  userId: string;
  userName: string;
  userTitle: string;
  userEmail: string;
  tier: RoleTier;
  /** Today's items (Admin/PM, in their default view), shown as a badge on the home item. */
  needsCount?: number;
  /** Can open Admin (the title, or Admin given on top of a PM role). */
  admin?: boolean;
  /** Open set-up jobs, shown on Admin. */
  adminCount?: number;
}) {
  const pick = (items: TieredItem[]) =>
    items
      .filter((i) => i.tiers.includes(tier))
      .map(({ label, href, icon }): NavItem => (href === "/ops" ? { label: tier === "CREATOR" ? "Home" : label, href, icon, badge: tier === "CREATOR" ? 0 : needsCount } : { label, href, icon }));
  return (
    <AppNav
      homeHref="/ops"
      tag="OPS"
      sections={[{ items: pick(MAIN) }]}
      bottom={[...(admin ? [{ label: "Admin", href: "/ops/admin", icon: Settings, badge: adminCount }] : []), { label: "Notifications", href: "/ops/notifications", icon: Bell }]}
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
