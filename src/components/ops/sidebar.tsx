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
import { PersonAvatar } from "@/components/ui/avatar";
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
    <aside className="flex h-screen w-56 shrink-0 flex-col justify-between border-r border-border bg-sidebar px-4 py-5">
      <div>
        <Link href="/ops" className="mb-8 flex px-2 text-foreground">
          <Logo className="h-5 w-auto" />
        </Link>
        <nav className="flex flex-col gap-0.5">
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
                  "flex items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-eggshell text-ink" : "text-ink/70 hover:bg-eggshell/60"
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {agencyItems.length > 0 && (
          <>
            <p className="mb-1 mt-6 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Agency
            </p>
            <nav className="flex flex-col gap-0.5">
              {agencyItems.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                      active ? "bg-eggshell text-ink" : "text-ink/70 hover:bg-eggshell/60"
                    )}
                  >
                    <item.icon className="size-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <PersonaSwitcher currentEmail={userEmail} />
        <Link href="/ops/account" className="flex items-center gap-2.5 rounded-full px-3 py-2 hover:bg-eggshell/60">
          <PersonAvatar name={userName} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{userName}</p>
            <p className="truncate text-xs text-muted-foreground">{userTitle}</p>
          </div>
        </Link>
      </div>
    </aside>
  );
}
