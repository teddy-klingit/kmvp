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
  Menu,
  X,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Avatar } from "@/components/ds/avatar";
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

type SidebarProps = {
  userName: string;
  userEmail: string;
  clientName: string;
  brands: { id: string; name: string }[];
  unreadCount: number;
};

/**
 * ≥768px: the sidebar (232px, collapsible to an icon rail).
 * <768px: a top bar with the logo and a menu button that opens the same nav as a sheet.
 */
export function PortalSidebar(props: SidebarProps) {
  const pathname = usePathname();
  const [manualOverride, setManualOverride] = useState<boolean | null>(null);
  const hasSecondarySidebar = pathname === "/assets" || pathname.startsWith("/assets/");
  const isNarrow = useIsNarrowViewport();
  const collapsed = manualOverride ?? hasSecondarySidebar;

  // Exposed so viewport-fixed elements (e.g. a bottom action bar) can offset
  // themselves correctly without needing to lift this component's state.
  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-width", isNarrow ? "0rem" : collapsed ? "4rem" : "14.5rem");
  }, [collapsed, isNarrow]);

  return (
    <>
      <MobileTopBar {...props} />
      <aside
        className={cn(
          "hidden h-screen shrink-0 flex-col justify-between border-r border-ds-border bg-ds-bg py-6 transition-[width] duration-200 md:flex",
          collapsed ? "w-16 px-2" : "w-[232px] px-4"
        )}
      >
        <SidebarContent {...props} collapsed={collapsed} onToggle={() => setManualOverride(!collapsed)} />
      </aside>
    </>
  );
}

function MobileTopBar(props: SidebarProps) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-ds-border bg-ds-bg px-4 md:hidden">
        <Link href="/dashboard" className="flex items-center text-ds-text" aria-label="Klingit home">
          <Logo className="h-5 w-auto" />
        </Link>
        <DialogPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label="Open menu"
            className="-mr-2 flex size-11 items-center justify-center rounded-[8px] text-ds-text hover:bg-ds-nav-active"
          >
            <Menu className="size-[22px]" strokeWidth={1.75} />
          </button>
        </DialogPrimitive.Trigger>
      </header>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 md:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[288px] max-w-[85vw] flex-col justify-between overflow-y-auto bg-ds-bg px-4 py-5 shadow-xl outline-none md:hidden">
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          <SidebarContent {...props} collapsed={false} onNavigate={() => setOpen(false)} onClose={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function SidebarContent({
  userName,
  userEmail,
  clientName,
  brands,
  unreadCount,
  collapsed,
  onToggle,
  onNavigate,
  onClose,
}: SidebarProps & { collapsed: boolean; onToggle?: () => void; onNavigate?: () => void; onClose?: () => void }) {
  const pathname = usePathname();
  // In the sheet every row is a 44px tap target.
  const row = onClose ? "py-3" : "py-2.5";
  return (
    <>
      <div>
        <div className={cn("mb-6 flex items-center px-3", collapsed ? "justify-center px-0" : "justify-between")}>
          {!collapsed && (
            <Link href="/dashboard" onClick={onNavigate} className="flex items-center text-foreground">
              <Logo className="h-5 w-auto" />
            </Link>
          )}
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close menu"
              className="-mr-2 flex size-11 items-center justify-center rounded-[8px] text-ds-text-2 hover:bg-ds-nav-active"
            >
              <X className="size-5" strokeWidth={1.75} />
            </button>
          )}
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

        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-[8px] px-3 text-[14px] transition-colors",
                  row,
                  collapsed && "justify-center",
                  active ? "bg-ds-nav-active font-medium text-ds-text" : "text-ds-text-2 hover:bg-ds-nav-active/60 hover:text-ds-text"
                )}
              >
                <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
                {!collapsed && item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-col gap-1">
        <PersonaSwitcher currentEmail={userEmail} compact={collapsed} />
        <Link
          href="/notifications"
          onClick={onNavigate}
          title={collapsed ? "Notifications" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-[8px] px-3 text-[14px] text-ds-text-2 hover:bg-ds-nav-active/60 hover:text-ds-text",
            row,
            collapsed && "justify-center"
          )}
        >
          <span className="relative">
            <Bell className="size-[18px]" strokeWidth={1.75} />
            {unreadCount > 0 && <span className="absolute -right-1 -top-1 size-1.5 rounded-full bg-orange" />}
          </span>
          {!collapsed && "Notifications"}
        </Link>
        <Link
          href="/help"
          onClick={onNavigate}
          title={collapsed ? "Help" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-[8px] px-3 text-[14px] text-ds-text-2 hover:bg-ds-nav-active/60 hover:text-ds-text",
            row,
            collapsed && "justify-center"
          )}
        >
          <HelpCircle className="size-[18px]" strokeWidth={1.75} />
          {!collapsed && "Help"}
        </Link>
        <Link
          href="/account"
          onClick={onNavigate}
          className={cn(
            "mt-2 flex items-center gap-3 border-t border-ds-border px-3 pt-4 no-underline",
            collapsed && "justify-center px-0"
          )}
        >
          <Avatar name={userName} size={32} />
          {!collapsed && (
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-[14px] font-medium text-ds-text">{userName}</span>
              <span className="truncate text-[12px] text-ds-text-2">{clientName}</span>
            </div>
          )}
        </Link>
      </div>
    </>
  );
}

const NARROW_QUERY = "(max-width: 767px)";

/** Phones get the top bar + sheet instead of the sidebar. */
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
