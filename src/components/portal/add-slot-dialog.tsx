"use client";

import Link from "next/link";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { pillClass } from "@/components/ds/button";
import { PlaceholderTag } from "@/components/ds/placeholder-tag";

/** "Add a slot": slots come with the plan, so this asks Klingit (no billing in this phase; the price is a placeholder). */
export function AddSlotDialog({ planName, slots, contactHref }: { planName: string; slots: number; contactHref: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className={pillClass("secondary", "sm")}>
          Add a slot
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md font-brand">
        <DialogHeader>
          <DialogTitle>Add an active slot</DialogTitle>
          <DialogDescription>
            Your {planName} plan runs {slots} project{slots === 1 ? "" : "s"} at a time. An extra slot means one more project in production at once.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-3 text-[14px]">
          <span>Price per extra slot: € —</span>
          <PlaceholderTag />
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Link href={contactHref} className={pillClass("primary")}>
            Ask Klingit
          </Link>
          <Link href="/settings/usage" className={pillClass("secondary")}>
            See your plan
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}
