"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { pillClass } from "@/components/ds/button";
import { requestSkillBuildAction } from "@/lib/actions/skill-request-actions";
import { cn } from "@/lib/utils";

/**
 * "Request a custom skill" (or "Request build" on a recommendation): describe it in a sentence; Klingit scopes it
 * and quotes the build in team credits. Opens a small dialog; the build then has its own page under Your skills.
 */
export function CustomSkillRequest({ label = "Request a custom skill", name, description, variant = "secondary", size = "md", block = false }: { label?: string; name?: string; description?: string; variant?: "primary" | "secondary"; size?: "sm" | "md"; block?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className={cn(pillClass(variant, size), block && "w-full justify-start")}>
          {label}
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-md font-brand">
        <DialogHeader>
          <DialogTitle>{name ? `Request “${name}”` : "Request a custom skill"}</DialogTitle>
          <DialogDescription>Klingit scopes it with you and quotes the build in team credits (paid once). Every run after that uses AI credits.</DialogDescription>
        </DialogHeader>
        <form action={requestSkillBuildAction} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] text-brand-ink-2">
            Name
            <input name="name" defaultValue={name} placeholder="e.g. Launch week planner" className="h-10 rounded-[10px] border border-brand-field px-3 text-[14px] text-brand-ink outline-none focus:border-brand-ink" />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] text-brand-ink-2">
            What should it do?
            <textarea name="description" required rows={4} defaultValue={description} placeholder="e.g. Turn every product launch into a week of social posts in our voice" className="resize-y rounded-[10px] border border-brand-field px-3 py-2 text-[14px] leading-[1.5] text-brand-ink outline-none focus:border-brand-ink" />
          </label>
          <button type="submit" className={cn(pillClass("primary"), "self-start")}>
            Send request
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
