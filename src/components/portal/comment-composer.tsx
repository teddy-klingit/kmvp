"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

function SendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="icon" className="rounded-full" disabled={pending}>
      {pending ? (
        <span className="flex gap-0.5">
          <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:-0.3s]" />
          <span className="size-1 animate-bounce rounded-full bg-current [animation-delay:-0.15s]" />
          <span className="size-1 animate-bounce rounded-full bg-current" />
        </span>
      ) : (
        <Send className="size-4" />
      )}
    </Button>
  );
}

export function CommentComposer({
  action,
  projectId,
  assetId,
  placeholder = "Write a message…",
}: {
  action: (formData: FormData) => void | Promise<void>;
  projectId: string;
  assetId?: string;
  placeholder?: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) => {
        formRef.current?.reset();
        return action(formData);
      }}
      className="flex gap-2"
    >
      <input type="hidden" name="projectId" value={projectId} />
      {assetId && <input type="hidden" name="assetId" value={assetId} />}
      <Input name="body" placeholder={placeholder} required autoComplete="off" />
      <SendButton />
    </form>
  );
}
