"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus, Pencil } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { createPriceListItemAction, updatePriceListItemAction, type PriceListState } from "@/lib/actions/price-list-actions";

const initialState: PriceListState = {};

type ExistingItem = {
  id: string;
  deliverableType: string;
  complexityTier: "LOW" | "MEDIUM" | "HIGH";
  creditCost: number;
  notes: string | null;
};

export function PriceListItemDialog({ item }: { item?: ExistingItem }) {
  const action = item ? updatePriceListItemAction : createPriceListItemAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [tier, setTier] = useState<string>(item?.complexityTier ?? "MEDIUM");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.error === null) setOpen(false);
  }, [state]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {item ? (
          <Button type="button" variant="secondary" size="sm" className="gap-1.5">
            <Pencil className="size-3.5" />
            Edit
          </Button>
        ) : (
          <Button type="button" className="gap-1.5">
            <Plus className="size-4" />
            Add row
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{item ? "Edit price list row" : "Add price list row"}</DialogTitle>
          <DialogDescription>Deliverable type + complexity tier must be unique together.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-3">
          {item && <input type="hidden" name="id" value={item.id} />}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="deliverableType">Deliverable type</Label>
            <Input id="deliverableType" name="deliverableType" required defaultValue={item?.deliverableType} placeholder="e.g. Social post (static)" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Complexity tier</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LOW">Low</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
              </SelectContent>
            </Select>
            <input type="hidden" name="complexityTier" value={tier} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="creditCost">Credit cost</Label>
            <Input id="creditCost" name="creditCost" type="number" min={1} step={1} required defaultValue={item?.creditCost} placeholder="e.g. 4" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Input id="notes" name="notes" defaultValue={item?.notes ?? ""} placeholder="Any scoping caveats" />
          </div>
          {state.error && <p className="text-sm text-danger-foreground">{state.error}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : item ? "Save changes" : "Add row"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
