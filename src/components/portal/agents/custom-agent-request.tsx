"use client";

import { useState } from "react";
import { requestAgentBuildAction } from "@/lib/actions/agent-request-actions";

/** "Something else?": a black button that opens a one-field request, sent as an agent build project. */
export function CustomAgentRequest() {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 items-center self-start rounded-full bg-brand-ink px-[18px] font-brand-mono text-[12px] text-white hover:bg-black">
        Request a custom agent
      </button>
    );
  }
  return (
    <form action={requestAgentBuildAction} className="flex flex-col gap-2">
      <label htmlFor="custom-agent" className="text-[13px] text-brand-ink-2">
        What should it do?
      </label>
      <textarea
        id="custom-agent"
        name="description"
        required
        autoFocus
        rows={3}
        placeholder="e.g. Turn every product launch into a week of social posts in our voice"
        className="resize-y rounded-[10px] border border-brand-field px-3 py-2 text-[14px] leading-[1.5] outline-none focus:border-brand-ink"
      />
      <div className="flex gap-2">
        <button type="submit" className="inline-flex h-10 items-center rounded-full bg-brand-ink px-[18px] font-brand-mono text-[12px] text-white hover:bg-black">
          Send request
        </button>
        <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-full border border-brand-outline px-[18px] font-brand-mono text-[12px]">
          Cancel
        </button>
      </div>
    </form>
  );
}
