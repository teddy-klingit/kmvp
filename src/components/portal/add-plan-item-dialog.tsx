"use client";

import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addClientCalendarItemAction } from "@/lib/actions/calendar-actions";
import { Plus } from "lucide-react";

function todayInputValue() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Logs something the client is running themselves — a town hall, a press
 * push, a recruiting event — onto the shared calendar alongside Klingit's
 * own production and the AI-suggested content. */
export function AddPlanItemDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm" className="gap-1.5">
          <Plus className="size-3.5" />
          Add your plan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add something you&apos;re running</DialogTitle>
        </DialogHeader>
        <form action={addClientCalendarItemAction} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Title</label>
            <Input name="title" placeholder="e.g. Recruiting fair — Berlin" required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <Input name="date" type="date" defaultValue={todayInputValue()} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Channel</label>
            <select name="channel" defaultValue="Organic social" className="h-9 rounded-md border border-border bg-card px-3 text-sm">
              <option>Organic social</option>
              <option>PR</option>
              <option>Email</option>
              <option>Event</option>
              <option>Other</option>
            </select>
          </div>
          <DialogFooter>
            <Button type="submit" size="sm">Add</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
