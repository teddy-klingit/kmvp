"use client";

import { Home, FolderKanban, Bot, Users, Archive, Building2, Tag, Bell } from "lucide-react";
import { PersonaSwitcher } from "@/components/shared/persona-switcher";
import { AppNav, RailHint, type NavItem } from "@/components/shared/app-nav";
import type { RoleTier } from "@/lib/role-tier";

type TieredItem = NavItem & { tiers: RoleTier[] };

const MAIN: TieredItem[] = [
  { label: "Needs you", href: "/ops", icon: Home, tiers: ["ADMIN", "PM", "CREATOR"] },
  { label: "Projects", href: "/ops/projects", icon: FolderKanban, tiers: ["ADMIN", "PM"] },
  { label: "Team", href: "/ops/team", icon: Users, tiers: ["ADMIN", "PM"] },
  { label: "Agents", href: "/ops/agents", icon: Bot, tiers: ["ADMIN"] },
];

const AGENCY: TieredItem[] = [
  { label: "Clients", href: "/ops/clients", icon: Building2, tiers: ["ADMIN", "PM"] },
  { label: "Price list", href: "/ops/price-list", icon: Tag, tiers: ["ADMIN", "PM"] },
  { label: "Archive", href: "/ops/archive", icon: Archive, tiers: ["ADMIN", "PM", "CREATOR"] },
];

/**
 * Ops nav (brand theme): Needs you (count badge), Projects, Team, Agents; Agency: Clients, Price list,
 * Archive. Billing, Analytics and Settings live in the Account menu; the Inbox is a Needs-you filter.
 */
export function OpsSidebar({
  userId,
  userName,
  userTitle,
  userEmail,
  tier,
  needsCount = 0,
}: {
  userId: string;
  userName: string;
  userTitle: string;
  userEmail: string;
  tier: RoleTier;
  /** Open "Needs you" exceptions (Admin/PM), shown as a badge on the home item. */
  needsCount?: number;
}) {
  const pick = (items: TieredItem[]) =>
    items
      .filter((i) => i.tiers.includes(tier))
      .map(({ label, href, icon }): NavItem => (href === "/ops" ? { label: tier === "CREATOR" ? "Home" : label, href, icon, badge: tier === "CREATOR" ? 0 : needsCount } : { label, href, icon }));
  const agency = pick(AGENCY);
  return (
    <AppNav
      homeHref="/ops"
      tag="OPS"
      sections={[{ items: pick(MAIN) }, ...(agency.length ? [{ label: "Agency", items: agency }] : [])]}
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
