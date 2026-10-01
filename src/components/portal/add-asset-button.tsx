"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBrandAssetAction } from "@/lib/actions/brand-asset-actions";

export function AddAssetButton({ category }: { category: string }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary" className="gap-1.5">
          <Plus className="size-3.5" />
          Add asset
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add asset</DialogTitle>
        </DialogHeader>
        <form
          action={(formData) => {
            startTransition(async () => {
              await createBrandAssetAction({}, formData);
              setOpen(false);
            });
          }}
          className="flex flex-col gap-3"
        >
          <input type="hidden" name="category" value={category} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input name="name" placeholder="e.g. Summer campaign key visual" required disabled={pending} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Variant (optional)</label>
            <Input name="variant" placeholder="e.g. Primary, Square crop" disabled={pending} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Format (optional)</label>
            <Input name="format" placeholder="e.g. SVG, PNG, MP4" disabled={pending} />
          </div>
          <Button type="submit" disabled={pending} className="mt-1 self-start">
            {pending ? "Adding…" : "Add asset"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
