"use client";

import { LayoutDashboard, FolderKanban, Sparkles, BarChart3, CalendarDays, FileText, LayoutGrid, Bell, ChevronsUpDown } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { PersonaSwitcher } from "@/components/shared/persona-switcher";
import { AppNav, type NavSection } from "@/components/shared/app-nav";

type SidebarProps = {
  userName: string;
  userEmail: string;
  clientName: string;
  brands: { id: string; name: string }[];
  unreadCount: number;
};

/**
 * Client nav (brand theme): Home, Projects, Brand IQ, Insights, Calendar, Reports, Custom apps; then
 * Notifications and the Account user block. Help lives in Account; "Switch view" is the demo persona switcher.
 */
export function PortalSidebar({ userName, userEmail, clientName, brands, unreadCount }: SidebarProps) {
  const sections: NavSection[] = [
    {
      items: [
        { label: "Home", href: "/dashboard", icon: LayoutDashboard },
        { label: "Projects", href: "/projects", icon: FolderKanban },
        { label: "Brand IQ", href: "/assets", icon: Sparkles },
        { label: "Insights", href: "/insights", icon: BarChart3 },
        { label: "Calendar", href: "/calendar", icon: CalendarDays },
        { label: "Reports", href: "/reports", icon: FileText },
        { label: "Custom apps", href: "/apps", icon: LayoutGrid },
      ],
    },
  ];
  return (
    <AppNav
      homeHref="/dashboard"
      sections={sections}
      bottom={[{ label: "Notifications", href: "/notifications", icon: Bell, dot: unreadCount > 0 }]}
      extra={<PersonaSwitcher currentEmail={userEmail} />}
      user={{ name: userName, sub: clientName, href: "/account" }}
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
