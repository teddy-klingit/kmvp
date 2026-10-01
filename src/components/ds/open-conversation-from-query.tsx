"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useConversation } from "@/components/ds/conversation-context";

/** `?channel=klingit` (e.g. the dashboard's "Message" button) opens the conversation panel on that channel. */
export function OpenConversationFromQuery() {
  const channel = useSearchParams().get("channel");
  const { open } = useConversation();
  useEffect(() => {
    if (channel) open({ channel });
    // Only on arrival with the parameter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel]);
  return null;
}
