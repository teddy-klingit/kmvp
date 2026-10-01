"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/** Under 768px the sidebar lives behind a floating "Chat" button, opened as a bottom sheet. */
export function ChatSheet({ unread, children }: { unread: number; children: React.ReactNode }) {
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(Boolean(searchParams.get("channel")));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-medium text-paper shadow-lg md:hidden"
        >
          <MessageCircle className="size-4" />
          Chat
          {unread > 0 && (
            <span className="flex min-w-5 items-center justify-center rounded-full bg-orange px-1.5 text-[11px] leading-5 text-paper">
              {unread}
            </span>
          )}
        </button>
      </DialogTrigger>
      <DialogContent className="bottom-0 left-0 top-auto flex h-[85vh] max-w-none translate-x-0 translate-y-0 flex-col gap-4 rounded-b-none rounded-t-2xl p-4 pt-5 md:hidden">
        <DialogTitle className="sr-only">Project chat</DialogTitle>
        {children}
      </DialogContent>
    </Dialog>
  );
}
