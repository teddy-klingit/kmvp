"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type MessageContext = { kind: string; ref?: string; label: string };

type OpenRequest = { channel?: string; context?: MessageContext | null };

type ConversationState = {
  channel: string;
  setChannel: (channel: string) => void;
  context: MessageContext | null;
  setContext: (context: MessageContext | null) => void;
  /** Bumps every time something asks the panel to open, so the panel can react (open + focus). */
  openSignal: number;
  open: (request?: OpenRequest) => void;
};

const Ctx = createContext<ConversationState | null>(null);

export function ConversationProvider({ defaultChannel, children }: { defaultChannel: string; children: React.ReactNode }) {
  const [channel, setChannel] = useState(defaultChannel);
  const [context, setContext] = useState<MessageContext | null>(null);
  const [openSignal, setOpenSignal] = useState(0);

  const open = useCallback(
    (request?: OpenRequest) => {
      if (request?.channel) setChannel(request.channel);
      if (request && "context" in request) setContext(request.context ?? null);
      setOpenSignal((n) => n + 1);
    },
    []
  );

  const value = useMemo(
    () => ({ channel, setChannel, context, setContext, openSignal, open }),
    [channel, context, openSignal, open]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useConversation() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConversation must be used inside ConversationProvider");
  return ctx;
}
