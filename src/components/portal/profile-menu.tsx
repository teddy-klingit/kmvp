"use client";

import { useTransition } from "react";
import Link from "next/link";
import { Bell, ChevronRight, ChevronsUpDown, Gauge, LayoutGrid, Link2, LogOut, Repeat, ScrollText, Users } from "lucide-react";
import { Avatar } from "@/components/ds/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/lib/actions/auth-actions";
import { switchPersonaAction } from "@/lib/actions/persona-actions";
import { DEMO_PERSONAS } from "@/lib/demo-personas";
import type { NavSummary } from "@/lib/nav-summary";
import { cn } from "@/lib/utils";

const n = (v: number) => v.toLocaleString("en-GB");
const personaForm = (key: string) => {
  const f = new FormData();
  f.set("persona", key);
  return f;
};

/**
 * The profile row at the bottom of the client nav and its menu (nav v3, 01): who you are, the plan chip (team and
 * AI credits left, links to Usage), the settings pages, Sign out. Usage is shown to admins only (the page itself
 * checks too). "Switch view" is the demo persona switcher.
 *
 * Switch view and Sign out run their action on select: a <form> inside a menu item is unmounted when the menu
 * closes on click, before it can submit, so clicking did nothing.
 */
export function ProfileMenu({ name, email, clientName, role, admin, summary, onNavigate }: { name: string; email: string; clientName: string; role: string; admin: boolean; summary: NavSummary; onNavigate?: () => void }) {
  const [pending, start] = useTransition();
  const items = [
    { label: "Plan", href: "/settings/plan", icon: Gauge },
    { label: "Account & team", href: "/settings/account", icon: Users },
    { label: "Notifications", href: "/settings/notifications", icon: Bell },
    { label: "Connections", href: "/settings/connections", icon: Link2 },
    { label: "Custom apps", href: "/settings/apps", icon: LayoutGrid },
    { label: "Reporting", href: "/settings/reporting", icon: ScrollText },
    ...(admin ? [{ label: "Usage", href: "/settings/usage", icon: Gauge, tag: "Admin" }] : [{ label: "My usage", href: "/settings/usage", icon: Gauge }]),
  ];
  const pools = summary.pools;
  const team = pools ? [pools.pm.monthly > 0 ? `PM ${n(pools.pm.left)}` : null, pools.creative.monthly > 0 || pools.creative.left > 0 ? `creative ${n(pools.creative.left)}` : null].filter(Boolean).join(" · ") || null : summary.team.allowance !== null ? `${n(summary.team.left ?? 0)} of ${n(summary.team.allowance)} team` : null;
  const ai = summary.ai.ownModel ? "own AI model" : summary.ai.allowance > 0 || summary.ai.left > 0 ? `${n(summary.ai.left)} of ${n(summary.ai.allowance)} AI left` : null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Account menu: ${name}`}
          className="mt-2 flex min-h-11 w-full items-center gap-3 rounded-[14px] bg-[#EAE4D6] px-3 py-2.5 text-left hover:bg-[#E3DCCB] rail:size-11 rail:justify-center rail:rounded-full rail:bg-transparent rail:p-0"
        >
          <Avatar name={name} size={34} />
          <span className="flex min-w-0 flex-1 flex-col whitespace-nowrap rail:sr-only">
            <span className="truncate text-[15px] font-semibold text-brand-ink">{name}</span>
            <span className="truncate font-brand-mono text-[11px] uppercase text-brand-ink-2">{clientName}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-brand-ink-2 rail:hidden" strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={8} className="w-[288px] rounded-[16px] border-brand-line bg-white p-2 font-brand shadow-lg">
        <div className="flex items-center gap-3 px-2 pb-3 pt-2">
          <Avatar name={name} size={40} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-[15px] font-semibold text-brand-ink">{name}</span>
            <span className="truncate text-[12px] text-brand-ink-2">
              {email} · {role}
            </span>
          </span>
        </div>
        <DropdownMenuItem asChild className="mb-1 rounded-[12px] p-0 focus:bg-transparent">
          <Link href="/settings/plan" onClick={onNavigate} className="flex items-center gap-2 rounded-[12px] bg-brand-page px-3 py-2.5 no-underline hover:bg-[#F2EDE3]">
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13px] font-semibold text-brand-ink">{summary.plan} plan</span>
              <span className="truncate text-[12px] text-brand-ink-2">{[team, ai].filter(Boolean).join(" · ") || "See usage"}</span>
            </span>
            <ChevronRight className="size-4 shrink-0 text-brand-ink-2" strokeWidth={1.75} />
          </Link>
        </DropdownMenuItem>
        {summary.marketingPm && (
          <DropdownMenuItem asChild className="mb-1 rounded-[12px] p-0 focus:bg-transparent">
            <Link href={summary.marketingPm.messageHref} onClick={onNavigate} className="flex items-center gap-2.5 rounded-[12px] px-3 py-2 no-underline hover:bg-[#F2EDE3]">
              <Avatar name={summary.marketingPm.name} size={28} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[12px] text-brand-ink-2">Your Marketing PM</span>
                <span className="truncate text-[13px] font-semibold text-brand-ink">{summary.marketingPm.name}</span>
              </span>
              <span className="text-[12px] text-brand-ink underline underline-offset-2">Message</span>
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator className="my-2 bg-brand-line" />
        {items.map((i) => (
          <DropdownMenuItem key={i.label} asChild className="rounded-[10px] px-2.5 py-2.5 text-[14px] text-brand-ink">
            <Link href={i.href} onClick={onNavigate} className="flex items-center gap-3 no-underline">
              <i.icon className="size-4 text-brand-ink-2" strokeWidth={1.75} />
              <span className="flex-1">{i.label}</span>
              {"tag" in i && i.tag && <span className="rounded-[6px] border border-brand-outline px-1.5 py-0.5 font-brand-mono text-[10px] uppercase text-brand-ink-2">{i.tag}</span>}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator className="my-2 bg-brand-line" />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-3 rounded-[10px] px-2.5 py-2.5 text-[14px] text-brand-ink-2">
            <Repeat className="size-4" strokeWidth={1.75} />
            Switch view (demo)
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56 font-brand">
            {DEMO_PERSONAS.map((p) => (
              <DropdownMenuItem key={p.key} disabled={pending} onSelect={() => start(() => switchPersonaAction(personaForm(p.key)))} className="flex w-full flex-col items-start">
                <span className={cn("text-[14px]", p.email === email && "font-semibold")}>{p.name}</span>
                <span className="text-[12px] text-brand-ink-2">{p.subtitle}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem disabled={pending} onSelect={() => start(() => signOutAction())} className="flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2.5 text-[14px] text-brand-ink">
          <LogOut className="size-4 text-brand-ink-2" strokeWidth={1.75} />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
