"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  FolderKanban,
  PackageCheck,
  Bot,
  Users,
  Archive,
  Building2,
  Receipt,
  BarChart3,
  Inbox,
  Settings,
  Tag,
} from "lucide-react";
import { Avatar } from "@/components/ds/avatar";
import { PersonaSwitcher } from "@/components/shared/persona-switcher";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";
import type { RoleTier } from "@/lib/role-tier";

const NAV_ITEMS = [
  { label: "Home", href: "/ops", icon: Home, tiers: ["ADMIN", "PM", "CREATOR"] },
  { label: "Projects", href: "/ops/projects", icon: FolderKanban, tiers: ["ADMIN", "PM"] },
  { label: "Delivery", href: "/ops/delivery", icon: PackageCheck, tiers: ["ADMIN", "PM", "CREATOR"] },
  { label: "Agents", href: "/ops/agents", icon: Bot, tiers: ["ADMIN"] },
  { label: "Team", href: "/ops/team", icon: Users, tiers: ["ADMIN", "PM"] },
  { label: "Archive", href: "/ops/archive", icon: Archive, tiers: ["ADMIN", "PM", "CREATOR"] },
] satisfies { label: string; href: string; icon: typeof Home; tiers: RoleTier[] }[];

const AGENCY_NAV_ITEMS = [
  { label: "Clients", href: "/ops/clients", icon: Building2, tiers: ["ADMIN", "PM"] },
  { label: "Price List", href: "/ops/price-list", icon: Tag, tiers: ["ADMIN", "PM"] },
  { label: "Billing", href: "/ops/billing", icon: Receipt, tiers: ["ADMIN"] },
  { label: "Analytics", href: "/ops/analytics", icon: BarChart3, tiers: ["ADMIN"] },
  { label: "Inbox", href: "/ops/inbox", icon: Inbox, tiers: ["ADMIN", "PM"] },
  { label: "Settings", href: "/ops/settings", icon: Settings, tiers: ["ADMIN"] },
] satisfies { label: string; href: string; icon: typeof Home; tiers: RoleTier[] }[];

export function OpsSidebar({
  userName,
  userTitle,
  userEmail,
  tier,
}: {
  userName: string;
  userTitle: string;
  userEmail: string;
  tier: RoleTier;
}) {
  const pathname = usePathname();
  const navItems = NAV_ITEMS.filter((i) => (i.tiers as RoleTier[]).includes(tier));
  const agencyItems = AGENCY_NAV_ITEMS.filter((i) => (i.tiers as RoleTier[]).includes(tier));

  return (
    <aside className="flex h-screen w-[232px] shrink-0 flex-col justify-between border-r border-ds-border bg-ds-bg px-4 py-6">
      <div>
        <Link href="/ops" className="mb-6 flex px-3 text-ds-text">
          <Logo className="h-5 w-auto" />
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {navItems.map((item) => {
            const active =
              item.href === "/ops"
                ? pathname === "/ops"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[14px] transition-colors",
                  active ? "bg-ds-nav-active font-medium text-ds-text" : "text-ds-text-2 hover:bg-ds-nav-active/60 hover:text-ds-text"
                )}
              >
                <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {agencyItems.length > 0 && (
          <>
            <p className="mb-1 mt-6 px-3 text-[12px] font-medium uppercase tracking-wider text-ds-text-3">
              Agency
            </p>
            <nav aria-label="Agency" className="flex flex-col gap-1">
              {agencyItems.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-[8px] px-3 py-2.5 text-[14px] transition-colors",
                      active ? "bg-ds-nav-active font-medium text-ds-text" : "text-ds-text-2 hover:bg-ds-nav-active/60 hover:text-ds-text"
                    )}
                  >
                    <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <PersonaSwitcher currentEmail={userEmail} />
        <Link href="/ops/account" className="mt-2 flex items-center gap-3 border-t border-ds-border px-3 pt-4 no-underline">
          <Avatar name={userName} size={32} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[14px] font-medium text-ds-text">{userName}</span>
            <span className="truncate text-[12px] text-ds-text-2">{userTitle}</span>
          </div>
        </Link>
      </div>
    </aside>
  );
}
