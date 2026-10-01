"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  Image as ImageIcon,
  BarChart3,
  CalendarDays,
  FileText,
  LayoutGrid,
  Settings,
  Bell,
  HelpCircle,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { PersonAvatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { PersonaSwitcher } from "@/components/shared/persona-switcher";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Projects", href: "/projects", icon: FolderKanban },
  { label: "Brand IQ", href: "/assets", icon: ImageIcon },
  { label: "Insights", href: "/insights", icon: BarChart3 },
  { label: "Calendar", href: "/calendar", icon: CalendarDays },
  { label: "Reports", href: "/reports", icon: FileText },
  { label: "Custom Apps", href: "/apps", icon: LayoutGrid },
  { label: "Account", href: "/account", icon: Settings },
];

export function PortalSidebar({
  userName,
  userEmail,
  clientName,
  brands,
  unreadCount,
}: {
  userName: string;
  userEmail: string;
  clientName: string;
  brands: { id: string; name: string }[];
  unreadCount: number;
}) {
  const pathname = usePathname();
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);
  const hasSecondarySidebar = pathname === "/assets" || pathname.startsWith("/assets/");
  const isNarrow = useIsNarrowViewport();
  const collapsed = manualOverride ?? (hasSecondarySidebar || isNarrow);

  // Exposed so viewport-fixed elements (e.g. a bottom action bar) can offset
  // themselves correctly without needing to lift this component's state.
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", collapsed ? "4rem" : "14rem");
  }, [collapsed]);

  return (
    <aside
      className={cn(
        "flex h-screen shrink-0 flex-col justify-between border-r border-border bg-sidebar py-5 transition-[width] duration-200",
        collapsed ? "w-16 px-2" : "w-56 px-4"
      )}
    >
      <div>
        <div className={cn("mb-8 flex items-center px-2", collapsed ? "justify-center" : "justify-between")}>
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center text-foreground">
              <Logo className="h-5 w-auto" />
            </Link>
          )}
          <button
            type="button"
            onClick={() => setManualOverride(!collapsed)}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
          </button>
        </div>

        {!collapsed && brands.length > 1 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="mb-4 flex w-full items-center justify-between rounded-full border border-surface bg-paper px-3 py-2 text-sm font-medium text-ink hover:border-ink/20">
                {clientName}
                <ChevronsUpDown className="size-3.5 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {brands.map((b) => (
                <DropdownMenuItem key={b.id}>{b.name}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        <nav className="flex flex-col gap-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium transition-colors",
                  collapsed && "justify-center",
                  active ? "bg-eggshell text-ink" : "text-ink/70 hover:bg-eggshell/60"
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-0.5">
        <PersonaSwitcher currentEmail={userEmail} compact={collapsed} />
        <Link
          href="/notifications"
          title={collapsed ? "Notifications" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium text-ink/70 hover:bg-eggshell/60",
            collapsed && "justify-center"
          )}
        >
          <span className="relative">
            <Bell className="size-4" />
            {unreadCount > 0 && <span className="absolute -right-1 -top-1 size-1.5 rounded-full bg-orange" />}
          </span>
          {!collapsed && "Notifications"}
        </Link>
        <Link
          href="/help"
          title={collapsed ? "Help" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-full px-3 py-2 text-sm font-medium text-ink/70 hover:bg-eggshell/60",
            collapsed && "justify-center"
          )}
        >
          <HelpCircle className="size-4" />
          {!collapsed && "Help"}
        </Link>
        <Link
          href="/account"
          className={cn(
            "mt-2 flex items-center gap-2.5 rounded-full px-3 py-2 hover:bg-eggshell/60",
            collapsed && "justify-center"
          )}
        >
          <PersonAvatar name={userName} size="md" />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{userName}</p>
              <p className="truncate text-xs text-muted-foreground">{clientName}</p>
            </div>
          )}
        </Link>
      </div>
    </aside>
  );
}

const NARROW_QUERY = "(max-width: 767px)";

/** Phones get the icon rail by default so the page itself keeps its width. */
function useIsNarrowViewport() {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(NARROW_QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false
  );
}
