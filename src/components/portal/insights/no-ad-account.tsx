import Link from "next/link";
import { Link2 } from "lucide-react";
import { pillClass } from "@/components/ds/button";

/**
 * Insights and Ask your data for a client that owns no ad account: one clear line and the way to fix it, never
 * a blank chart or zeros (live-ads-owner.ts adDataStatus "none").
 */
export function NoAdAccount({ admin, compact = false }: { admin: boolean; compact?: boolean }) {
  const body = admin
    ? "Connect Meta, TikTok, Google Ads or LinkedIn and Insights shows your spend, clicks and which creative works. Ask your data answers from it too."
    : "Once your admin connects Meta, TikTok, Google Ads or LinkedIn, Insights shows your spend, clicks and which creative works.";
  if (compact)
    return (
      <p role="status" className="m-0 flex flex-col gap-1 rounded-[10px] bg-brand-page px-4 py-3 text-[13px] leading-[1.5]">
        <b className="font-semibold">No ad account connected yet</b>
        <span className="text-brand-ink-2">Answers about your ads need one. Market and SEO questions still work.</span>
        <Link href="/settings/connections" className="self-start text-brand-ink underline underline-offset-2">
          Go to Connections
        </Link>
      </p>
    );
  return (
    <section role="status" aria-label="No ad account connected yet" className="flex flex-col items-start gap-4 rounded-[12px] bg-white px-6 py-8 min-[700px]:flex-row min-[700px]:items-center min-[700px]:gap-6 min-[700px]:px-8">
      <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-brand-chip">
        <Link2 className="size-5" strokeWidth={1.75} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="m-0 text-[20px] font-normal leading-[1.3]">No ad account connected yet</h2>
        <span className="max-w-[60ch] text-[15px] leading-[1.5] text-brand-ink-2">{body}</span>
      </span>
      <Link href="/settings/connections" className={pillClass("primary", "md")}>
        {admin ? "Go to Connections" : "See Connections"}
      </Link>
    </section>
  );
}
