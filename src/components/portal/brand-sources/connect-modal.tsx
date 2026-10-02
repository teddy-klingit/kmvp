"use client";

import { useActionState, useState, useTransition } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Check, FileText, Folder, LayoutTemplate, Loader2, StickyNote, X } from "lucide-react";
import { AppIcon } from "@/components/portal/brand-sources/app-icon";
import { Button } from "@/components/ds/button";
import { StatusPill } from "@/components/ds/status-pill";
import { connectDemoAppAction, disconnectAppAction, type SourceState } from "@/lib/actions/brand-source-actions";
import { appMeta, DEMO_FILES, type SourceApp } from "@/lib/brand-sources";
import { cn } from "@/lib/utils";

const KIND_ICON = { file: FileText, folder: Folder, page: StickyNote, library: LayoutTemplate };

/**
 * The connect flow, shaped like a real one: sign in → pick files → connected. It's a demo:
 * signing in is simulated and nothing is synced; the connection and picked files are stored.
 */
export function ConnectModal({
  app,
  connected,
  linkedCount,
  initialStep = 1,
  open: controlledOpen,
}: {
  app: Exclude<SourceApp, "web">;
  connected: boolean;
  linkedCount: number;
  /** Screenshot runs open a given step directly. */
  initialStep?: 1 | 2 | 3;
  open?: boolean;
}) {
  const meta = appMeta(app);
  const files = DEMO_FILES[app];
  const [open, setOpen] = useState(controlledOpen ?? false);
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);
  const [signingIn, startSignIn] = useTransition();
  const [picked, setPicked] = useState<string[]>(files.slice(0, 2).map((f) => f.key));
  const [state, action, pending] = useActionState<SourceState, FormData>(async (prev, fd) => {
    const r = await connectDemoAppAction(prev, fd);
    if (r.ok) setStep(3);
    return r;
  }, {});

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setStep(connected ? 2 : 1);
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <Button variant="secondary" size="md" className="shrink-0">
          {connected ? "Manage" : "Connect"}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex w-[480px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[12px] bg-white shadow-[0_16px_48px_rgba(16,24,40,0.2)] outline-none">
          <div className="flex items-center gap-3 border-b border-ds-divider px-6 py-[18px]">
            <AppIcon app={app} size={18} tile />
            <div className="flex min-w-0 flex-1 flex-col">
              <DialogPrimitive.Title className="m-0 text-[15px] font-semibold text-ds-text">Connect {meta.name}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="m-0 text-[12px] text-ds-text-2">Step {step} of 3 · {["Sign in", "Choose what Klingit can see", "Connected"][step - 1]}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close aria-label="Close" className="flex size-8 items-center justify-center rounded-[8px] text-ds-text-2 hover:bg-ds-subtle">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>

          {/* Step dots */}
          <div className="flex gap-1.5 px-6 pt-4" aria-hidden>
            {[1, 2, 3].map((n) => (
              <span key={n} className={cn("h-1 flex-1 rounded-full", n <= step ? "bg-ds-text" : "bg-ds-border")} />
            ))}
          </div>

          <div className="flex min-h-[260px] flex-col px-6 pb-5 pt-5">
            {step === 1 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                <AppIcon app={app} size={28} tile />
                <div className="flex flex-col gap-1">
                  <span className="text-[16px] font-semibold text-ds-text">Sign in to {meta.name}</span>
                  <span className="max-w-[340px] text-[14px] text-ds-text-2">Klingit gets read-only access to the files you choose next. You can disconnect at any time.</span>
                </div>
                <button
                  type="button"
                  disabled={signingIn}
                  onClick={() => startSignIn(() => new Promise<void>((r) => setTimeout(() => (setStep(2), r()), 700)))}
                  className="inline-flex h-11 items-center gap-2.5 rounded-[8px] border border-ds-control-border bg-white px-5 text-[14px] font-medium text-ds-text hover:border-ds-text-3"
                >
                  {signingIn ? <Loader2 className="size-4 animate-spin" /> : <AppIcon app={app} size={16} />}
                  Sign in with {meta.name}
                </button>
              </div>
            )}

            {step === 2 && (
              <form action={action} className="flex flex-1 flex-col gap-3">
                <input type="hidden" name="app" value={app} />
                <span className="text-[14px] text-ds-text">Pick the folders and files Klingit&apos;s agents can use as reference.</span>
                <ul className="m-0 flex list-none flex-col divide-y divide-ds-divider rounded-[10px] border border-ds-border p-0">
                  {files.map((f) => {
                    const Icon = KIND_ICON[f.kind];
                    const on = picked.includes(f.key);
                    return (
                      <li key={f.key}>
                        <label className="flex cursor-pointer items-center gap-3 px-3.5 py-3 hover:bg-ds-subtle-2">
                          <input
                            type="checkbox"
                            name="file"
                            value={f.key}
                            checked={on}
                            onChange={() => setPicked((p) => (on ? p.filter((k) => k !== f.key) : [...p, f.key]))}
                            className="size-4 accent-[var(--ds-text)]"
                          />
                          <Icon className="size-4 text-ds-text-2" strokeWidth={1.75} />
                          <span className="min-w-0 flex-1 truncate text-[14px] text-ds-text">{f.title}</span>
                          <span className="text-[12px] text-ds-text-3">{f.kind}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                {state.error && <p className="m-0 text-[13px] text-ds-danger-text">{state.error}</p>}
                <div className="mt-auto flex justify-end gap-2 pt-2">
                  <Button type="button" variant="secondary" size="md" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button type="submit" variant="primary" size="md" disabled={pending || picked.length === 0}>
                    {pending ? "Connecting…" : `Connect ${picked.length} item${picked.length === 1 ? "" : "s"}`}
                  </Button>
                </div>
              </form>
            )}

            {step === 3 && (
              <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-ds-success-tint text-ds-success-text">
                  <Check className="size-6" strokeWidth={2.25} />
                </span>
                <div className="flex flex-col items-center gap-1.5">
                  <span className="text-[16px] font-semibold text-ds-text">{meta.name} is connected</span>
                  <StatusPill tone="success">Connected · demo</StatusPill>
                  <span className="max-w-[340px] text-[14px] text-ds-text-2">
                    {state.ok ?? `${linkedCount} items linked`}. Pin them to any Brand OS section with “Add source”.
                  </span>
                </div>
                <div className="flex gap-2">
                  {connected && (
                    <form action={disconnectAppAction}>
                      <input type="hidden" name="app" value={app} />
                      <Button type="submit" variant="ghost" size="md">
                        Disconnect
                      </Button>
                    </form>
                  )}
                  <DialogPrimitive.Close asChild>
                    <Button variant="primary" size="md">
                      Done
                    </Button>
                  </DialogPrimitive.Close>
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-ds-divider bg-ds-subtle-2 px-6 py-3 text-[12px] text-ds-text-2">Demo: no data is synced yet. Signing in is simulated.</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
