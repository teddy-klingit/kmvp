"use client";

import { Button, type ButtonProps } from "@/components/ds/button";
import { useConversation, type MessageContext } from "@/components/ds/conversation-context";

/** Every "Ask a question" opens the ConversationPanel on the given channel, composer focused, context pre-filled. */
export function AskButton({
  context,
  channel = "klingit",
  children = "Ask a question",
  ...props
}: Omit<ButtonProps, "onClick" | "context"> & { context?: MessageContext; channel?: string }) {
  const { open } = useConversation();
  return (
    <Button variant="secondary" size="lg" onClick={() => open({ channel, context: context ?? null })} {...props}>
      {children}
    </Button>
  );
}
