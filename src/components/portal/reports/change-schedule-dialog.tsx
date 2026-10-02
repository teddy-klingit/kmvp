"use client";

import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { updateReportScheduleAction } from "@/lib/actions/report-actions";
import { pillClass } from "@/components/ds/button";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "CHANGE SCHEDULE": when the report goes out and who on your team gets it. */
export function ChangeScheduleDialog({ day, time, team }: { day: number; time: string; team: { id: string; name: string; chosen: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button type="button" className="min-h-11 self-start font-brand-mono text-[12px] text-brand-ink underline underline-offset-4 hover:no-underline sm:min-h-0">
          CHANGE SCHEDULE
        </button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30" />
        <DialogPrimitive.Content className="fixed left-1/2 top-1/2 z-50 flex w-[420px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-[12px] bg-white font-brand shadow-[0_16px_48px_rgba(30,30,30,0.2)] outline-none">
          <div className="flex items-center border-b border-brand-line px-6 py-5">
            <DialogPrimitive.Title className="m-0 flex-1 text-[18px] font-normal">Report schedule</DialogPrimitive.Title>
            <DialogPrimitive.Close aria-label="Close" className="flex size-9 items-center justify-center rounded-full text-brand-ink-2 hover:bg-brand-chip">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">Choose the day, time and recipients of your report.</DialogPrimitive.Description>
          <form
            action={async (fd) => {
              await updateReportScheduleAction(fd);
              setOpen(false);
            }}
            className="flex flex-col gap-5 px-6 py-5"
          >
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5 text-[13px] text-brand-ink-2">
                Day
                <select name="day" defaultValue={day} className="h-11 rounded-[8px] border border-brand-outline bg-white px-3 text-[14px] text-brand-ink sm:h-10">
                  {DAYS.map((d, i) => (
                    <option key={d} value={i + 1}>
                      {d}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-[13px] text-brand-ink-2">
                Time (Stockholm)
                <input type="time" name="time" defaultValue={time} className="h-11 rounded-[8px] border border-brand-outline bg-white px-3 text-[14px] text-brand-ink sm:h-10" />
              </label>
            </div>
            <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
              <legend className="mb-1.5 text-[13px] text-brand-ink-2">Send to</legend>
              {team.map((m) => (
                <label key={m.id} className="flex min-h-11 items-center gap-3 text-[14px] sm:min-h-0">
                  <input type="checkbox" name="recipient" value={m.id} defaultChecked={m.chosen} className="size-4 accent-[var(--brand-ink)]" />
                  {m.name}
                </label>
              ))}
            </fieldset>
            <div className="flex justify-end gap-2">
              <DialogPrimitive.Close asChild>
                <button type="button" className={pillClass("secondary")}>
                  Cancel
                </button>
              </DialogPrimitive.Close>
              <button type="submit" className={pillClass("primary")}>
                Save
              </button>
            </div>
          </form>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
