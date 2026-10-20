"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { saveOutputLinkAction, type LinkState } from "@/lib/actions/tagged-link-actions";
import type { TaggedLink as Link } from "@/lib/utm";

/**
 * Phase V: the link to use for this piece, with Klingit's UTMs on it, so the revenue it brings is linked back to it
 * in Insights → Revenue. Copy it; admins can change where it points.
 */
export function TaggedLink({ link, kind, id, admin }: { link: Link; kind: "asset" | "output"; id: string; admin: boolean }) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(!link.url && admin);
  const [state, act, pending] = useActionState<LinkState, FormData>(saveOutputLinkAction, {});
  const copy = async () => {
    if (!link.url) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard refused: the link is selectable text.
    }
  };
  return (
    <section aria-label="Tagged link" className="flex flex-col gap-3 rounded-[12px] bg-white px-6 py-5">
      <header className="flex items-center gap-3">
        <h2 className="m-0 flex-1 text-[16px] font-normal">Tagged link</h2>
        <span className="font-brand-mono text-[11px] uppercase text-brand-ink-2">UTM · automatic</span>
      </header>
      {link.url ? (
        <div className="flex items-start gap-2 rounded-[10px] bg-brand-page px-3 py-2.5">
          <code className="min-w-0 flex-1 select-all break-all font-brand-mono text-[12px] leading-[1.5]">{link.url}</code>
          <button type="button" onClick={copy} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-brand-ink px-3 font-brand-mono text-[11px] text-white">
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      ) : (
        <p className="m-0 text-[14px] text-brand-ink-2">Add the page this piece points to, and we&apos;ll tag it.</p>
      )}
      <p className="m-0 text-[12px] text-brand-ink-2">
        Use this link wherever it runs. utm_campaign {link.params.campaign} · utm_content is this piece, so the orders and deals it brings show under Insights → Revenue.
      </p>
      {admin &&
        (editing ? (
          <form action={act} className="flex flex-wrap items-center gap-2">
            <input type="hidden" name="kind" value={kind} />
            <input type="hidden" name="id" value={id} />
            <input name="url" defaultValue={link.custom ? (link.base ?? "") : ""} placeholder={link.base ?? "https://your-site.com/page"} aria-label="Where this piece points" className="h-10 min-w-0 flex-1 rounded-full border border-[#CFC8B8] bg-white px-4 text-[14px]" />
            <button type="submit" disabled={pending} className="h-10 rounded-full bg-brand-ink px-4 font-brand-mono text-[12px] text-white disabled:opacity-50">
              Save
            </button>
            {state.error && <span className="w-full text-[13px] text-[#A8321F]">{state.error}</span>}
          </form>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="self-start text-[13px] text-brand-ink underline underline-offset-2">
            {link.custom ? "Change where it points" : "Points to your website · change"}
          </button>
        ))}
      {state.ok && <span className="text-[13px] text-[#5E6B2A]">{state.ok}</span>}
    </section>
  );
}
