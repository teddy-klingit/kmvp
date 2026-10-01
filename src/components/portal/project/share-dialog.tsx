"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Header "Share" button. Opens on its own when arriving from the old /team URL (?share=1). */
export function ShareDialog({ projectName, children }: { projectName: string; children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(searchParams.get("share") === "1");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="gap-1.5">
          <Share2 className="size-3.5" />
          Share
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Share {projectName}</DialogTitle>
          <DialogDescription>Who on your team can see and work on this project.</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
