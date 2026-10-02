"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Menu, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Avatar } from "@/components/ds/avatar";
import { Logo } from "@/components/ui/logo";
import { cn } from "@/lib/utils";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Count badge (orange: it's waiting on you). */
  badge?: number;
  /** Small unread dot on the icon. */
  dot?: boolean;
};

export type NavSection = { label?: string; items: NavItem[] };

type NavProps = {
  homeHref: string;
  /** "OPS" chip next to the logo. */
  tag?: string;
  sections: NavSection[];
  bottom: NavItem[];
  /** Extra rows above the bottom items (the demo persona switcher). */
  extra?: React.ReactNode;
  /** Under the logo (the brand switcher, for users with several brands). */
  top?: React.ReactNode;
  user: { name: string; sub: string; href: string };
};

/** The most specific matching href is active, so "/ops" doesn't light up on "/ops/projects". */
function activeHref(pathname: string, items: NavItem[]) {
  return items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/**
 * The one app shell nav (brand theme, both apps): cream column, real logo, pill rows with an ink
 * active item. Under 900px it becomes a top bar with a menu sheet holding the same rows.
 */
export function AppNav(props: NavProps) {
  useEffect(() => {
    // Viewport-fixed elements (e.g. a bottom action bar) offset themselves by this.
    const media = window.matchMedia("(max-width: 899px)");
    const set = () => document.documentElement.style.setProperty("--sidebar-width", media.matches ? "0rem" : "15rem");
    set();
    media.addEventListener("change", set);
    return () => media.removeEventListener("change", set);
  }, []);

  return (
    <>
      <MobileTopBar {...props} />
      <aside className="hidden h-screen w-[240px] shrink-0 flex-col justify-between overflow-y-auto bg-brand-page px-4 pb-5 pt-7 min-[900px]:flex">
        <NavContent {...props} />
      </aside>
    </>
  );
}

function MobileTopBar(props: NavProps) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-brand-line bg-brand-page px-4 min-[900px]:hidden">
        <LogoLink {...props} />
        <DialogPrimitive.Trigger asChild>
          <button type="button" aria-label="Open menu" className="-mr-2 flex size-11 items-center justify-center rounded-full text-brand-ink hover:bg-brand-ink/5">
            <Menu className="size-[22px]" strokeWidth={1.75} />
          </button>
        </DialogPrimitive.Trigger>
      </header>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 min-[900px]:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[288px] max-w-[85vw] flex-col justify-between overflow-y-auto bg-brand-page px-4 py-5 font-brand shadow-xl outline-none min-[900px]:hidden">
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          <NavContent {...props} onClose={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function LogoLink({ homeHref, tag }: NavProps) {
  return (
    <Link href={homeHref} aria-label="Klingit home" className="flex items-center gap-2 text-brand-ink no-underline">
      <Logo className="h-[26px] w-auto" />
      {tag && <span className="rounded-full bg-brand-ink px-2 py-0.5 font-brand-mono text-[11px] text-white">{tag}</span>}
    </Link>
  );
}

function NavRow({ item, active, sheet, onNavigate }: { item: NavItem; active: boolean; sheet: boolean; onNavigate?: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-full px-3.5 text-[15px] no-underline transition-colors",
        sheet ? "py-3" : "py-[11px]",
        active ? "bg-brand-ink text-white" : "text-brand-ink-2 hover:bg-brand-ink/5 hover:text-brand-ink"
      )}
    >
      <span className="relative">
        <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
        {item.dot && <span aria-label="Unread" className="absolute -right-1 -top-1 size-1.5 rounded-full bg-brand-orange" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge ? (
        <span aria-label={`${item.badge} open`} className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-orange px-1.5 font-brand-mono text-[11px] text-brand-ink">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function NavContent({ onClose, ...props }: NavProps & { onClose?: () => void }) {
  const pathname = usePathname() ?? "";
  const all = [...props.sections.flatMap((s) => s.items), ...props.bottom, { label: "Account", href: props.user.href, icon: Menu }];
  const active = activeHref(pathname, all);
  const sheet = Boolean(onClose);
  return (
    <>
      <div className="flex flex-col">
        <div className="mb-8 flex items-center justify-between px-3">
          <LogoLink {...props} />
          {onClose && (
            <button type="button" onClick={onClose} aria-label="Close menu" className="-mr-2 flex size-11 items-center justify-center rounded-full text-brand-ink-2 hover:bg-brand-ink/5">
              <X className="size-5" strokeWidth={1.75} />
            </button>
          )}
        </div>
        {props.top}
        {props.sections.map((s, i) => (
          <div key={s.label ?? i} className={cn(i > 0 && "mt-6")}>
            {s.label && <p className="mb-1.5 px-3.5 font-brand-mono text-[11px] uppercase text-brand-ink-2">{s.label}</p>}
            <nav aria-label={s.label ?? "Main"} className="flex flex-col gap-1">
              {s.items.map((item) => (
                <NavRow key={item.href} item={item} active={item.href === active} sheet={sheet} onNavigate={onClose} />
              ))}
            </nav>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-1">
        {props.extra}
        {props.bottom.map((item) => (
          <NavRow key={item.href} item={item} active={item.href === active} sheet={sheet} onNavigate={onClose} />
        ))}
        <Link
          href={props.user.href}
          onClick={onClose}
          aria-label={`Account: ${props.user.name}`}
          aria-current={props.user.href === active ? "page" : undefined}
          className={cn(
            "mt-2 flex min-h-11 items-center gap-3 border-t border-brand-rule px-3.5 pt-4 no-underline",
            props.user.href === active && "text-brand-ink"
          )}
        >
          <Avatar name={props.user.name} size={34} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-semibold text-brand-ink">{props.user.name}</span>
            <span className="truncate font-brand-mono text-[11px] uppercase text-brand-ink-2">{props.user.sub}</span>
          </span>
        </Link>
      </div>
    </>
  );
}
