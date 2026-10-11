"use client";

import { usePathname } from "next/navigation";
import { SendToChannelDialog } from "@/components/portal/send-to-channel-dialog";
import { PillLink } from "@/components/ds/pill-link";

type Channel = Parameters<typeof SendToChannelDialog>[0]["channels"][number];

/** Reports header: "Build custom report" and "Send to…", labelled for the report you're on. */
export function ReportHeaderActions({ channels, weeklyLabel, monthlyLabel }: { channels: Channel[]; weeklyLabel: string; monthlyLabel: string }) {
  const pathname = usePathname() ?? "/settings/reporting";
  const subject = pathname.startsWith("/settings/reporting/custom") ? "Custom report" : pathname.startsWith("/settings/reporting/monthly") ? `Monthly report — ${monthlyLabel}` : `Weekly report — ${weeklyLabel}`;
  return (
    <>
      {!pathname.startsWith("/settings/reporting/custom") && <PillLink href="/settings/reporting/custom">Build custom report</PillLink>}
      <SendToChannelDialog channels={channels} subjectType="REPORT" subjectLabel={subject} returnTo={pathname} />
    </>
  );
}
