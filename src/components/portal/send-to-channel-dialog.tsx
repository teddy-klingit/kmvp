"use client";

import { useState } from "react";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChannelBadge, channelTypeLabel } from "@/components/portal/channel-icon";
import { sendToChannelAction } from "@/lib/actions/channel-actions";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

type Channel = { id: string; type: string; name: string };

export function SendToChannelDialog({
  channels,
  subjectType,
  subjectLabel,
  returnTo,
  label = "Send to…",
}: {
  channels: Channel[];
  subjectType: "BRIEF" | "REPORT";
  subjectLabel: string;
  returnTo: string;
  label?: string;
}) {
  const [selected, setSelected] = useState<string | null>(channels[0]?.id ?? null);

  if (channels.length === 0) {
    return (
      <Button type="button" variant="secondary" size="sm" className="gap-1.5" disabled title="Connect a Slack, Teams, or email channel in Account settings first">
        <Send className="size-3.5" />
        {label}
      </Button>
    );
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm" className="gap-1.5">
          <Send className="size-3.5" />
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Send to a connected channel</DialogTitle>
          <DialogDescription>Pushes &quot;{subjectLabel}&quot; to the channel you pick — no need to export and paste it manually.</DialogDescription>
        </DialogHeader>
        <form action={sendToChannelAction} className="flex flex-col gap-3">
          <input type="hidden" name="subjectType" value={subjectType} />
          <input type="hidden" name="subjectLabel" value={subjectLabel} />
          <input type="hidden" name="returnTo" value={returnTo} />
          <input type="hidden" name="channelId" value={selected ?? ""} />
          <div className="flex flex-col gap-1.5">
            {channels.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c.id)}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                  selected === c.id ? "border-accent bg-accent-soft/40" : "border-border hover:bg-muted"
                )}
              >
                <ChannelBadge type={c.type} className="size-8" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{channelTypeLabel(c.type)}</p>
                </div>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button type="submit" size="sm" disabled={!selected} className="gap-1.5">
              <Send className="size-3.5" />
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
