"use client";

import { Repeat } from "lucide-react";
import { PersonAvatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { switchPersonaAction } from "@/lib/actions/persona-actions";
import { DEMO_PERSONAS } from "@/lib/demo-personas";
import { cn } from "@/lib/utils";

/**
 * Demo-only fast switcher between the client view and the three internal
 * role tiers, so one showcase session can jump personas without separate
 * logins. Shown in both app shells.
 */
export function PersonaSwitcher({ currentEmail, compact = false }: { currentEmail: string; compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          title="Switch view"
          className={cn(
            "flex min-h-11 w-full items-center gap-3 rounded-full py-2 text-[13px] text-brand-ink-2 hover:bg-brand-ink/5 hover:text-brand-ink sm:min-h-0",
            compact ? "justify-center px-2" : "px-3.5"
          )}
        >
          <Repeat className="size-[18px]" strokeWidth={1.75} />
          {!compact && "Switch view"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel>Preview as (demo)</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {DEMO_PERSONAS.map((persona) => (
          <form key={persona.key} action={switchPersonaAction}>
            <input type="hidden" name="persona" value={persona.key} />
            <DropdownMenuItem asChild>
              <button type="submit" className="w-full">
                <PersonAvatar name={persona.name} size="sm" />
                <span className="min-w-0 flex-1 text-left">
                  <span
                    className={
                      persona.email === currentEmail ? "block truncate font-semibold text-primary" : "block truncate"
                    }
                  >
                    {persona.name}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{persona.subtitle}</span>
                </span>
              </button>
            </DropdownMenuItem>
          </form>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
