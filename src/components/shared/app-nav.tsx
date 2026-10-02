"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { Menu, PanelLeft, X } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Avatar } from "@/components/ds/avatar";
import { Logo, LogoMark } from "@/components/ui/logo";
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
  /** Extra rows above the bottom items (the demo persona switcher), and its icon-only form for the folded rail. */
  extra?: React.ReactNode;
  extraRail?: React.ReactNode;
  /** Under the logo (the brand switcher, for users with several brands). Hidden on the folded rail. */
  top?: React.ReactNode;
  user: { name: string; sub: string; href: string };
  /** Whose fold choice this is (the signed-in user), so each user on a shared browser keeps their own. */
  storageKey: string;
};

/** The most specific matching href is active, so "/ops" doesn't light up on "/ops/projects". */
function activeHref(pathname: string, items: NavItem[]) {
  return items
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

// ─── Fold state ────────────────────────────────────────────────────────────
// "open" | "folded" once known on the client; "auto" on the server and first paint, where CSS applies the
// default (open from 1280px, folded from 900 to 1279px; see the `rail` variant in globals.css).

type NavState = "open" | "folded";
const EVENT = "klingit:nav";
const WIDE = "(min-width: 1280px)";
/** Used when localStorage throws (private windows, blocked site data): the choice lasts for the visit. */
const memory = new Map<string, NavState>();

function readNav(key: string): NavState {
  let stored = memory.get(key) ?? null;
  try {
    const v = window.localStorage.getItem(key);
    if (v === "open" || v === "folded") stored = v;
  } catch {}
  return stored ?? (window.matchMedia(WIDE).matches ? "open" : "folded");
}

function writeNav(key: string, state: NavState) {
  memory.set(key, state);
  try {
    window.localStorage.setItem(key, state);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

function subscribeNav(onChange: () => void) {
  const wide = window.matchMedia(WIDE);
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  wide.addEventListener("change", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
    wide.removeEventListener("change", onChange);
  };
}

function useNavState(key: string) {
  return useSyncExternalStore(subscribeNav, () => readNav(key), () => "auto" as const);
}

// ─── Rail tooltips ─────────────────────────────────────────────────────────
// One fixed-position label beside the rail (fixed, so the aside's scroll box doesn't clip it).

type Hint = { label: string; top: number } | null;
const HintContext = createContext<((label: string | null, el?: HTMLElement) => void) | null>(null);

function useHint(label: string) {
  const show = useContext(HintContext);
  if (!show) return {};
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => show(label, e.currentTarget),
    onMouseLeave: () => show(null),
    onFocus: (e: React.FocusEvent<HTMLElement>) => show(label, e.currentTarget),
    onBlur: () => show(null),
  };
}

/** A rail tooltip for a control the nav doesn't render itself (the compact persona switcher). */
export function RailHint({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="block" {...useHint(label)}>
      {children}
    </span>
  );
}

/**
 * The one app shell nav (brand theme, both apps): a full-height column a shade darker than the page, with a
 * rule on its right edge; the page scrolls on its own beside it. It folds to a 72px icon rail (the fold
 * button or Cmd/Ctrl + \), remembered per user. Under 900px it becomes a top bar with a menu sheet.
 */
export function AppNav(props: NavProps) {
  const key = `klingit.nav.${props.storageKey}`;
  const state = useNavState(key);
  const folded = state === "folded";
  const [hint, setHint] = useState<Hint>(null);

  useEffect(() => {
    if (state === "auto") return;
    // Viewport-fixed elements (e.g. a bottom action bar) offset themselves by this.
    const media = window.matchMedia("(max-width: 899px)");
    const set = () => document.documentElement.style.setProperty("--sidebar-width", media.matches ? "0px" : folded ? "72px" : "240px");
    set();
    media.addEventListener("change", set);
    return () => media.removeEventListener("change", set);
  }, [state, folded]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "\\" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (!window.matchMedia("(min-width: 900px)").matches) return;
      e.preventDefault();
      setHint(null);
      writeNav(key, readNav(key) === "folded" ? "open" : "folded");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [key]);

  const toggle = () => {
    setHint(null);
    writeNav(key, folded ? "open" : "folded");
  };
  const showHint = (label: string | null, el?: HTMLElement) => {
    if (!label || !el) return setHint(null);
    const r = el.getBoundingClientRect();
    setHint({ label, top: r.top + r.height / 2 });
  };

  return (
    <>
      <MobileTopBar {...props} />
      <aside
        data-nav={state}
        className="hidden h-screen w-[240px] shrink-0 flex-col justify-between overflow-y-auto overflow-x-hidden border-r border-brand-rule bg-brand-nav px-3.5 pb-5 pt-7 transition-[width] duration-200 ease-out motion-reduce:transition-none min-[900px]:flex rail:w-[72px]"
      >
        <HintContext.Provider value={folded ? showHint : null}>
          <NavContent {...props} onFold={toggle} folded={folded} />
        </HintContext.Provider>
        {folded && hint && (
          <span
            role="tooltip"
            style={{ top: hint.top }}
            className="pointer-events-none fixed left-[80px] z-50 -translate-y-1/2 whitespace-nowrap rounded-full bg-brand-ink px-3 py-1.5 text-[13px] text-white shadow-md"
          >
            {hint.label}
          </span>
        )}
      </aside>
    </>
  );
}

function MobileTopBar(props: NavProps) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b border-brand-rule bg-brand-nav px-4 min-[900px]:hidden">
        <LogoLink {...props} />
        <DialogPrimitive.Trigger asChild>
          <button type="button" aria-label="Open menu" className="-mr-2 flex size-11 items-center justify-center rounded-full text-brand-ink hover:bg-brand-ink/5">
            <Menu className="size-[22px]" strokeWidth={1.75} />
          </button>
        </DialogPrimitive.Trigger>
      </header>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 min-[900px]:hidden" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-[288px] max-w-[85vw] flex-col justify-between overflow-y-auto border-r border-brand-rule bg-brand-nav px-4 py-5 font-brand shadow-xl outline-none min-[900px]:hidden">
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
          <NavContent {...props} onClose={() => setOpen(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function LogoLink({ homeHref, tag }: NavProps) {
  const hint = useHint("Home");
  return (
    <Link href={homeHref} aria-label="Klingit home" {...hint} className="flex items-center gap-2 text-brand-ink no-underline">
      <Logo className="h-[26px] w-auto rail:hidden" />
      <LogoMark className="hidden h-[30px] w-auto rail:block" />
      {tag && <span className="rounded-full bg-brand-ink px-2 py-0.5 font-brand-mono text-[11px] text-white rail:hidden">{tag}</span>}
    </Link>
  );
}

function FoldButton({ folded, onFold }: { folded: boolean; onFold: () => void }) {
  const label = folded ? "Expand navigation" : "Collapse navigation";
  const hint = useHint(label);
  return (
    <button
      type="button"
      onClick={onFold}
      aria-label={label}
      title={folded ? undefined : `${label} (Ctrl or ⌘ + \\)`}
      {...hint}
      className="-mr-1.5 flex size-9 shrink-0 items-center justify-center rounded-full text-brand-ink-2 hover:bg-brand-ink/5 hover:text-brand-ink rail:mr-0 rail:size-11"
    >
      <PanelLeft className="size-[18px]" strokeWidth={1.75} />
    </button>
  );
}

function NavRow({ item, active, sheet, onNavigate }: { item: NavItem; active: boolean; sheet: boolean; onNavigate?: () => void }) {
  const hint = useHint(item.badge ? `${item.label} · ${item.badge}` : item.label);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      {...hint}
      className={cn(
        // Rail: a 44px circle with the icon where it sits in the open row, so nothing jumps while the width animates.
        "flex items-center gap-3 rounded-full px-[13px] text-[15px] no-underline transition-colors rail:size-11 rail:justify-center rail:px-0",
        sheet ? "py-3" : "py-[11px]",
        active ? "bg-brand-ink text-white" : "text-brand-ink-2 hover:bg-brand-ink/5 hover:text-brand-ink"
      )}
    >
      <span className="relative">
        <item.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
        {item.dot && <span aria-label="Unread" className="absolute -right-1 -top-1 size-1.5 rounded-full bg-brand-orange" />}
        {item.badge ? (
          <span aria-hidden className="absolute -right-2.5 -top-2 hidden h-4 min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 font-brand-mono text-[10px] text-brand-ink rail:flex">
            {item.badge}
          </span>
        ) : null}
      </span>
      <span className="min-w-0 flex-1 truncate whitespace-nowrap rail:sr-only">{item.label}</span>
      {item.badge ? (
        <span aria-label={`${item.badge} open`} className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-orange px-1.5 font-brand-mono text-[11px] text-brand-ink rail:hidden">
          {item.badge}
        </span>
      ) : null}
    </Link>
  );
}

function UserLink({ user, active, onClose }: { user: NavProps["user"]; active: boolean; onClose?: () => void }) {
  const hint = useHint(user.name);
  return (
    <Link
      href={user.href}
      onClick={onClose}
      aria-label={`Account: ${user.name}`}
      aria-current={active ? "page" : undefined}
      {...hint}
      className={cn("mt-2 flex min-h-11 items-center gap-3 border-t border-brand-rule px-[13px] pt-4 no-underline rail:justify-center rail:px-0", active && "text-brand-ink")}
    >
      <Avatar name={user.name} size={34} />
      <span className="flex min-w-0 flex-col whitespace-nowrap rail:sr-only">
        <span className="truncate text-[15px] font-semibold text-brand-ink">{user.name}</span>
        <span className="truncate font-brand-mono text-[11px] uppercase text-brand-ink-2">{user.sub}</span>
      </span>
    </Link>
  );
}

function NavContent({ onClose, onFold, folded = false, ...props }: NavProps & { onClose?: () => void; onFold?: () => void; folded?: boolean }) {
  const pathname = usePathname() ?? "";
  const all = [...props.sections.flatMap((s) => s.items), ...props.bottom, { label: "Account", href: props.user.href, icon: Menu }];
  const active = activeHref(pathname, all);
  const sheet = Boolean(onClose);
  return (
    <>
      <div className="flex flex-col rail:items-center">
        <div className="mb-8 flex items-center justify-between gap-2 pl-[13px] rail:flex-col rail:gap-4 rail:pl-0">
          <LogoLink {...props} />
          {onClose ? (
            <button type="button" onClick={onClose} aria-label="Close menu" className="-mr-2 flex size-11 items-center justify-center rounded-full text-brand-ink-2 hover:bg-brand-ink/5">
              <X className="size-5" strokeWidth={1.75} />
            </button>
          ) : (
            onFold && <FoldButton folded={folded} onFold={onFold} />
          )}
        </div>
        {props.top && <div className="rail:hidden">{props.top}</div>}
        {props.sections.map((s, i) => (
          <div key={s.label ?? i} className={cn("rail:flex rail:flex-col rail:items-center", i > 0 && "mt-6 rail:mt-4")}>
            {s.label && (
              <>
                <p className="mb-1.5 whitespace-nowrap px-[13px] font-brand-mono text-[11px] uppercase text-brand-ink-2 rail:sr-only">{s.label}</p>
                <span aria-hidden className="mb-4 hidden h-px w-6 bg-brand-rule rail:block" />
              </>
            )}
            <nav aria-label={s.label ?? "Main"} className="flex flex-col gap-1 rail:items-center">
              {s.items.map((item) => (
                <NavRow key={item.href} item={item} active={item.href === active} sheet={sheet} onNavigate={onClose} />
              ))}
            </nav>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-1 rail:items-center">
        {props.extra && <div className="rail:hidden">{props.extra}</div>}
        {props.extraRail && <div className="hidden rail:block">{props.extraRail}</div>}
        {props.bottom.map((item) => (
          <NavRow key={item.href} item={item} active={item.href === active} sheet={sheet} onNavigate={onClose} />
        ))}
        <UserLink user={props.user} active={props.user.href === active} onClose={onClose} />
      </div>
    </>
  );
}
