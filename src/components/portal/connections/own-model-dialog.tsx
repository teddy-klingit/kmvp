"use client";

import { useActionState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { pillClass } from "@/components/ds/button";
import { connectOwnModelAction, type ConnectionState } from "@/lib/actions/connection-actions";
import { cn } from "@/lib/utils";

/** Connections → Your own AI model: paste an API key. Used only on Basic; your provider bills the tokens. */
export function OwnModelDialog({ app, name, basic }: { app: string; name: string; basic: boolean }) {
  const [state, action, pending] = useActionState<ConnectionState, FormData>(connectOwnModelAction, {});
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className={pillClass("primary", "sm")}>
          Connect
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md font-brand">
        <DialogHeader>
          <DialogTitle>Connect {name}</DialogTitle>
          <DialogDescription>
            {basic ? "Your skills and assistants will run on this account; your provider bills the tokens and Klingit shows how many were used." : "This is used only on the Basic plan. On your current plan, skills and assistants use Klingit AI credits."}
          </DialogDescription>
        </DialogHeader>
        {state.ok ? (
          <p className="m-0 text-[14px]">{state.ok}</p>
        ) : (
          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="app" value={app} />
            <label className="flex flex-col gap-1.5 text-[13px] text-brand-ink-2">
              API key
              <input name="apiKey" type="password" required autoComplete="off" placeholder={app === "claude" ? "sk-ant-…" : "sk-…"} className="h-10 rounded-[10px] border border-brand-field px-3 font-brand-mono text-[13px] text-brand-ink outline-none focus:border-brand-ink" />
            </label>
            {state.error && <p className="m-0 text-[13px] text-ds-danger-text">{state.error}</p>}
            <button type="submit" disabled={pending} className={cn(pillClass("primary"), "self-start")}>
              {pending ? "Connecting…" : "Connect"}
            </button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
