"use client";

import { LayoutGrid, Image as ImageIcon, Loader, SquareKanban, Layers, CalendarDays, BarChart3, Bell, ChevronsUpDown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AppNav, type NavSection } from "@/components/shared/app-nav";
import { ProfileMenu } from "@/components/portal/profile-menu";
import type { NavSummary } from "@/lib/nav-summary";

type SidebarProps = {
  userId: string;
  userName: string;
  userEmail: string;
  clientName: string;
  role: string;
  admin: boolean;
  brands: { id: string; name: string }[];
  unreadCount: number;
  summary: NavSummary;
};

/**
 * Client nav v3: Home · Brand OS · Skills · Ongoing projects · Output library · Calendar · Insights; then the
 * Notifications inbox and the profile menu (settings, Usage for admins, Sign out). Home's badge counts what needs you.
 */
export function PortalSidebar({ userId, userName, userEmail, clientName, role, admin, brands, unreadCount, summary }: SidebarProps) {
  const sections: NavSection[] = [
    {
      items: [
        { label: "Home", href: "/dashboard", icon: LayoutGrid, badge: summary.needsYou || undefined },
        { label: "Brand OS", href: "/assets", icon: ImageIcon },
        { label: "Skills", href: "/skills", icon: Loader },
        { label: "Ongoing projects", href: "/projects", icon: SquareKanban },
        { label: "Output library", href: "/library", icon: Layers },
        { label: "Calendar", href: "/calendar", icon: CalendarDays },
        { label: "Insights", href: "/insights", icon: BarChart3 },
      ],
    },
  ];
  return (
    <AppNav
      homeHref="/dashboard"
      sections={sections}
      bottom={[{ label: "Notifications", href: "/notifications", icon: Bell, dot: unreadCount > 0 }]}
      storageKey={userId}
      user={{ name: userName, sub: clientName, href: "/settings/account" }}
      userMenu={(onClose) => <ProfileMenu name={userName} email={userEmail} clientName={clientName} role={role} admin={admin} summary={summary} onNavigate={onClose} />}
      top={
        brands.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="mb-4 flex min-h-11 w-full items-center justify-between rounded-full border border-brand-outline bg-white px-3.5 text-[14px] text-brand-ink hover:border-brand-ink sm:min-h-9">
                {clientName}
                <ChevronsUpDown className="size-3.5 text-brand-ink-2" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {brands.map((b) => (
                <DropdownMenuItem key={b.id}>{b.name}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null
      }
    />
  );
}
