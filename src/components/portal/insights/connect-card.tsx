import { PillLink } from "@/components/ds/pill-link";
import { unlockSentence, type MissingSource } from "@/lib/insights-data";

/**
 * The one place a missing data source is explained. Metrics without data are hidden everywhere else
 * (never a "—" tile). Connecting is done by the client's Klingit team, so the button opens that chat.
 */
export function ConnectCard({ missing, connected, href }: { missing: MissingSource[]; connected: string[]; href: string }) {
  if (missing.length === 0) return null;
  const names = missing.map((m) => m.name);
  const have = connected.length === 0 ? "Nothing is connected yet" : `Only ${connected.join(" and ")} ${connected.length === 1 ? "is" : "are"} connected`;
  return (
    <section aria-label="Connect more data" className="flex flex-col gap-3 rounded-[12px] bg-brand-chip px-6 py-5">
      <span className="text-[16px] leading-[1.4]">Connect {names.join(" and ")}</span>
      <span className="text-[13px] leading-[1.55] text-brand-ink-2">
        {have}, so {unlockSentence(missing)} can&apos;t be shown yet.
      </span>
      <PillLink href={href} variant="primary" size="sm" className="self-start">
        Connect accounts
      </PillLink>
    </section>
  );
}
